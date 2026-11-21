import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Filter,
    X,
    Trash2,
    GripVertical,
    Pencil,
    StickyNote,
    Sparkles,
    Hash,
    Plus,
    CalendarDays,
    RotateCcw,
} from "lucide-react";
import type { Task, UserProfile, Lead, Project, Ticket, Employee } from "../types";
import type { Language } from "../utils/translations";
import { TaskPillText, MENTION_STYLE_MAP, type MentionEntity } from "./TaskPillText";
import { TaskTagMentionInput } from "./TaskTagMentionInput";
import { projectDisplayName } from "../utils/projects";
import { isClientRecord } from "../utils/clientRecord";
import { useTimeTracking } from "../hooks/useTimeTracking";
import { holidayName, type HolidayLanguage } from "../utils/holidays";
import {
    type WeeklyPlanCard,
    type WeeklyPlanDayNote,
    type WeeklyPlanRef,
    type WeeklyPlanFilterChip,
    WEEKLY_PLAN_CARD_COLORS,
    formatIsoDate,
    parseIsoDate,
    addLocalDays,
    getMondayOfWeek,
    getWeekDates,
    getIsoWeekNumber,
    extractWeeklyPlanRefs,
    weeklyPlanRefKey,
    collectWeekFilterChips,
    cardMatchesActiveFilters,
    fetchWeeklyPlan,
    saveWeeklyPlanCard,
    reorderWeeklyPlanCards,
    deleteWeeklyPlanCard,
    saveWeeklyPlanDayNote,
} from "../utils/weeklyPlanApi";

interface WeeklyPlanViewProps {
    leads: Lead[];
    projects?: Project[];
    tickets?: Ticket[];
    users?: UserProfile[];
    employees?: Employee[];
    tasks?: Task[];
    existingTags?: string[];
    systemLanguage: Language;
    canEdit: boolean;
}

const WEEKEND_STORAGE_KEY = "ccrm_weekly_plan_show_weekends";
const FILTER_BAR_STORAGE_KEY = "ccrm_weekly_plan_filter_bar_open";

const CARD_COLOR_STYLES: Record<
    string,
    { cardBg: string; dotBg: string; label: [string, string, string] }
> = {
    "": {
        cardBg: "bg-white border-slate-200/90 hover:border-indigo-300",
        dotBg: "bg-white border-slate-300 hover:border-indigo-400",
        label: ["Default", "Predvolená", "Alapértelmezett"],
    },
    indigo: {
        cardBg: "bg-indigo-50/80 border-indigo-200 hover:border-indigo-300",
        dotBg: "bg-indigo-500 border-indigo-600",
        label: ["Indigo", "Indigová", "Indigó"],
    },
    emerald: {
        cardBg: "bg-emerald-50/80 border-emerald-200 hover:border-emerald-300",
        dotBg: "bg-emerald-500 border-emerald-600",
        label: ["Green", "Zelená", "Zöld"],
    },
    amber: {
        cardBg: "bg-amber-50/85 border-amber-200 hover:border-amber-300",
        dotBg: "bg-amber-400 border-amber-500",
        label: ["Yellow", "Žltá", "Sárga"],
    },
    rose: {
        cardBg: "bg-rose-50/80 border-rose-200 hover:border-rose-300",
        dotBg: "bg-rose-500 border-rose-600",
        label: ["Red", "Červená", "Piros"],
    },
    sky: {
        cardBg: "bg-sky-50/80 border-sky-200 hover:border-sky-300",
        dotBg: "bg-sky-500 border-sky-600",
        label: ["Blue", "Modrá", "Kék"],
    },
    purple: {
        cardBg: "bg-purple-50/80 border-purple-200 hover:border-purple-300",
        dotBg: "bg-purple-500 border-purple-600",
        label: ["Purple", "Fialová", "Lila"],
    },
    orange: {
        cardBg: "bg-orange-50/80 border-orange-200 hover:border-orange-300",
        dotBg: "bg-orange-500 border-orange-600",
        label: ["Orange", "Oranžová", "Narancs"],
    },
};

export const WeeklyPlanView: React.FC<WeeklyPlanViewProps> = ({
    leads,
    projects = [],
    tickets = [],
    users = [],
    employees = [],
    tasks = [],
    existingTags = [],
    systemLanguage,
    canEdit,
}) => {
    const t = useCallback(
        (en: string, sk: string, hu: string) =>
            systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en,
        [systemLanguage],
    );

    const dateLocale =
        systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US";

    const todayIso = useMemo(() => formatIsoDate(new Date()), []);

    const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
    const [showWeekends, setShowWeekends] = useState<boolean>(() => {
        try {
            return localStorage.getItem(WEEKEND_STORAGE_KEY) !== "0";
        } catch {
            return true;
        }
    });
    const [isFilterBarOpen, setIsFilterBarOpen] = useState<boolean>(() => {
        try {
            return localStorage.getItem(FILTER_BAR_STORAGE_KEY) !== "0";
        } catch {
            return true;
        }
    });

    const [cards, setCards] = useState<WeeklyPlanCard[]>([]);
    const [notesByDate, setNotesByDate] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [activeFilterKeys, setActiveFilterKeys] = useState<Set<string>>(new Set());

    // Rapid card creation draft state
    const [draftDate, setDraftDate] = useState<string | null>(null);
    const [draftText, setDraftText] = useState<string>("");
    const [draftRefs, setDraftRefs] = useState<WeeklyPlanRef[]>([]);
    const [draftColor, setDraftColor] = useState<string>("");
    const draftInputElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const draftSubmittingRef = useRef<boolean>(false);

    // Inline card edit state
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editText, setEditText] = useState<string>("");
    const [editRefs, setEditRefs] = useState<WeeklyPlanRef[]>([]);
    const [editColor, setEditColor] = useState<string>("");
    const editSubmittingRef = useRef<boolean>(false);

    // Card color picker popover state
    const [colorPickerCardId, setColorPickerCardId] = useState<string | null>(null);

    // Day note edit state
    const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState<string>("");

    // Drag & drop state
    const [dragCardId, setDragCardId] = useState<string | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<{
        date: string;
        index: number | null;
    } | null>(null);

    const weekDates = useMemo(
        () => getWeekDates(weekMonday, showWeekends),
        [weekMonday, showWeekends],
    );

    const rangeFrom = weekDates[0];
    const rangeTo = weekDates[weekDates.length - 1];
    const weekNumber = useMemo(() => getIsoWeekNumber(weekMonday), [weekMonday]);

    // Holiday calendar integration (reuses Time Tracking SK/HU statutory + override rules)
    const { defaultCountry, workCountry, calendarFor, ensureHolidayYears } = useTimeTracking();
    const holidayCountry = workCountry || defaultCountry || "SK";

    useEffect(() => {
        const years = Array.from(new Set(weekDates.map((d) => Number(d.slice(0, 4)))));
        ensureHolidayYears(holidayCountry, years);
    }, [holidayCountry, weekDates, ensureHolidayYears]);

    const holidayCal = useMemo(
        () => calendarFor(holidayCountry),
        [calendarFor, holidayCountry],
    );

    // Build unified mention entities list for @ autocomplete and pill rendering:
    // Users, Employees, Projects, Clients, Leads, Tickets, and Tasks
    const mentionEntities: MentionEntity[] = useMemo(() => {
        const list: MentionEntity[] = [];

        (users || []).forEach((u) => {
            if (!u.name) return;
            list.push({
                id: u.id || u.name,
                name: u.name,
                type: "user",
                detail: u.role || t("Team member", "Člen tímu", "Csapattag"),
            });
        });

        (employees || []).forEach((emp) => {
            if (!emp.name) return;
            list.push({
                id: emp.id,
                name: emp.name,
                type: "employee",
                detail: emp.position || emp.department || t("Employee", "Zamestnanec", "Alkalmazott"),
            });
        });

        (projects || []).forEach((p) => {
            const name = projectDisplayName(
                p,
                leads,
                t("Untitled project", "Projekt bez názvu", "Névtelen projekt"),
            );
            list.push({
                id: p.id,
                name,
                type: "project",
                detail: p.status || t("Project", "Projekt", "Projekt"),
            });
        });

        (leads || []).forEach((l) => {
            if (!l.name) return;
            if (isClientRecord(l)) {
                list.push({
                    id: l.id,
                    name: l.name,
                    type: "client",
                    detail: l.city || t("Client", "Klient", "Ügyfél"),
                });
            } else {
                list.push({
                    id: l.id,
                    name: l.name,
                    type: "lead",
                    detail: l.status || "Lead",
                });
            }
        });

        (tickets || []).forEach((tk) => {
            const label = tk.ticketNumber
                ? `${tk.ticketNumber} ${tk.subject || tk.title || ""}`.trim()
                : tk.subject || tk.title || tk.id;
            if (!label) return;
            list.push({
                id: tk.id,
                name: label,
                type: "ticket",
                detail: tk.status || t("Ticket", "Tiket", "Jegy"),
            });
        });

        (tasks || []).forEach((task) => {
            if (!task.title || task.archived) return;
            list.push({
                id: task.id,
                name: task.title,
                type: "task",
                detail: task.status || (task.deadline ? `${t("Due", "Termín", "Határidő")} ${task.deadline}` : t("Task", "Úloha", "Feladat")),
            });
        });

        return list;
    }, [users, employees, projects, leads, tickets, tasks, t]);

    const allTags = useMemo(() => {
        const set = new Set<string>(existingTags);
        cards.forEach((c) => {
            extractWeeklyPlanRefs(c.content, mentionEntities, c.refs).forEach((r) => {
                if (r.kind === "tag") set.add(r.label);
            });
        });
        return Array.from(set).sort();
    }, [existingTags, cards, mentionEntities]);

    // Load visible week's cards and day notes from server
    const loadWeek = useCallback(async () => {
        setLoading(true);
        try {
            const fullEnd = formatIsoDate(addLocalDays(weekMonday, 6));
            const data = await fetchWeeklyPlan(rangeFrom, fullEnd);
            setCards(data.cards || []);
            const map: Record<string, string> = {};
            (data.notes || []).forEach((n: WeeklyPlanDayNote) => {
                map[n.date] = n.note || "";
            });
            setNotesByDate(map);
        } catch (err: any) {
            window.showToast?.(
                err?.message ||
                    t(
                        "Failed to load weekly plan",
                        "Nepodarilo sa načítať týždenný plán",
                        "Nem sikerült betölteni a heti tervet",
                    ),
                "error",
            );
        } finally {
            setLoading(false);
        }
    }, [rangeFrom, weekMonday, t]);

    useEffect(() => {
        loadWeek();
        setActiveFilterKeys(new Set());
        setDraftDate(null);
        setDraftText("");
        setDraftColor("");
        setEditingCardId(null);
        setEditingNoteDate(null);
        setColorPickerCardId(null);
    }, [loadWeek]);

    useEffect(() => {
        if (!colorPickerCardId) return;
        const closeOnOutside = () => setColorPickerCardId(null);
        const closeOnEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setColorPickerCardId(null);
        };
        document.addEventListener("mousedown", closeOnOutside);
        document.addEventListener("keydown", closeOnEsc);
        return () => {
            document.removeEventListener("mousedown", closeOnOutside);
            document.removeEventListener("keydown", closeOnEsc);
        };
    }, [colorPickerCardId]);

    const toggleWeekends = () => {
        setShowWeekends((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(WEEKEND_STORAGE_KEY, next ? "1" : "0");
            } catch {
                // ignore
            }
            return next;
        });
    };

    const toggleFilterBarOpen = (force?: boolean) => {
        setIsFilterBarOpen((prev) => {
            const next = typeof force === "boolean" ? force : !prev;
            try {
                localStorage.setItem(FILTER_BAR_STORAGE_KEY, next ? "1" : "0");
            } catch {
                // ignore
            }
            return next;
        });
    };

    const cardsByDate = useMemo(() => {
        const map: Record<string, WeeklyPlanCard[]> = {};
        for (const d of weekDates) map[d] = [];
        cards.forEach((c) => {
            if (!map[c.date]) map[c.date] = [];
            map[c.date].push(c);
        });
        Object.keys(map).forEach((d) => {
            map[d].sort((a, b) => a.position - b.position);
        });
        return map;
    }, [cards, weekDates]);

    const visibleWeekCards = useMemo(
        () => weekDates.flatMap((d) => cardsByDate[d] || []),
        [weekDates, cardsByDate],
    );

    const filterChips: WeeklyPlanFilterChip[] = useMemo(
        () => collectWeekFilterChips(visibleWeekCards, mentionEntities),
        [visibleWeekCards, mentionEntities],
    );

    // Prune active filter keys that are no longer referenced in the visible week
    useEffect(() => {
        if (activeFilterKeys.size === 0) return;
        const available = new Set(filterChips.map((c) => c.key));
        const pruned = new Set([...activeFilterKeys].filter((k) => available.has(k)));
        if (pruned.size !== activeFilterKeys.size) {
            setActiveFilterKeys(pruned);
        }
    }, [filterChips, activeFilterKeys]);

    const toggleFilterKey = (key: string) => {
        setActiveFilterKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleTagPillClick = (tag: string) => {
        const key = `tag:${tag.trim().toLowerCase()}`;
        toggleFilterKey(key);
        if (!isFilterBarOpen) toggleFilterBarOpen(true);
    };

    const handleMentionPillClick = (entity: MentionEntity | undefined, mentionName: string) => {
        const key = entity
            ? weeklyPlanRefKey({ kind: entity.type, id: entity.id, label: entity.name })
            : `user:${mentionName.trim().toLowerCase()}`;
        toggleFilterKey(key);
        if (!isFilterBarOpen) toggleFilterBarOpen(true);
    };

    // Rapid card creation: open blank card in day's next free slot
    const openDraftForDay = (dateIso: string) => {
        if (!canEdit) return;
        setEditingCardId(null);
        setColorPickerCardId(null);
        setDraftDate(dateIso);
        setDraftText("");
        setDraftRefs([]);
        setDraftColor("");
        setTimeout(() => draftInputElRef.current?.focus(), 0);
    };

    const commitDraft = async (chainNext: boolean) => {
        if (draftSubmittingRef.current) return;
        const targetDate = draftDate;
        const text = draftText.trim();
        if (!targetDate) return;

        if (!text) {
            if (!chainNext) {
                setDraftDate(null);
                setDraftText("");
                setDraftRefs([]);
                setDraftColor("");
            }
            return;
        }

        draftSubmittingRef.current = true;
        const existingInDay = cardsByDate[targetDate] || [];
        const nextPos =
            existingInDay.length > 0
                ? Math.max(...existingInDay.map((c) => c.position)) + 1
                : 0;
        const tempId = `wpc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const refs = extractWeeklyPlanRefs(text, mentionEntities, draftRefs);
        const chosenColor = draftColor;

        const optimistic: WeeklyPlanCard = {
            id: tempId,
            date: targetDate,
            content: text,
            position: nextPos,
            completed: false,
            color: chosenColor,
            refs,
        };

        setCards((prev) => [...prev, optimistic]);
        if (chainNext) {
            // Keep composer open & empty right below for rapid entry
            setDraftText("");
            setDraftRefs([]);
            setDraftColor("");
        } else {
            setDraftDate(null);
            setDraftText("");
            setDraftRefs([]);
            setDraftColor("");
        }

        try {
            const saved = await saveWeeklyPlanCard({
                id: tempId,
                date: targetDate,
                content: text,
                position: nextPos,
                completed: false,
                color: chosenColor,
                refs,
            });
            setCards((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
        } catch (err: any) {
            setCards((prev) => prev.filter((c) => c.id !== tempId));
            window.showToast?.(
                err?.message ||
                    t("Failed to save card", "Nepodarilo sa uložiť kartu", "Nem sikerült menteni a kártyát"),
                "error",
            );
        } finally {
            draftSubmittingRef.current = false;
            if (chainNext) {
                setTimeout(() => draftInputElRef.current?.focus(), 0);
            }
        }
    };

    // Inline card editing
    const startEditingCard = (card: WeeklyPlanCard) => {
        if (!canEdit) return;
        setDraftDate(null);
        setColorPickerCardId(null);
        setEditingCardId(card.id);
        setEditText(card.content);
        setEditRefs(card.refs || []);
        setEditColor(card.color || "");
    };

    const commitEditCard = async (card: WeeklyPlanCard) => {
        if (editSubmittingRef.current) return;
        const trimmed = editText.trim();
        if (!trimmed) {
            setEditingCardId(null);
            return;
        }
        const nextColor = editColor;
        if (trimmed === card.content.trim() && nextColor === (card.color || "")) {
            setEditingCardId(null);
            return;
        }

        editSubmittingRef.current = true;
        const refs = extractWeeklyPlanRefs(trimmed, mentionEntities, editRefs);
        const prevContent = card.content;
        const prevRefs = card.refs;
        const prevColor = card.color || "";

        setCards((prev) =>
            prev.map((c) => (c.id === card.id ? { ...c, content: trimmed, color: nextColor, refs } : c)),
        );
        setEditingCardId(null);

        try {
            const saved = await saveWeeklyPlanCard({
                id: card.id,
                date: card.date,
                content: trimmed,
                position: card.position,
                completed: card.completed,
                color: nextColor,
                refs,
            });
            setCards((prev) => prev.map((c) => (c.id === card.id ? saved : c)));
        } catch (err: any) {
            setCards((prev) =>
                prev.map((c) =>
                    c.id === card.id
                        ? { ...c, content: prevContent, color: prevColor, refs: prevRefs }
                        : c,
                ),
            );
            window.showToast?.(
                err?.message ||
                    t("Failed to update card", "Nepodarilo sa upraviť kartu", "Nem sikerült módosítani a kártyát"),
                "error",
            );
        } finally {
            editSubmittingRef.current = false;
        }
    };

    const handleChangeCardColor = async (card: WeeklyPlanCard, nextColor: string) => {
        if (!canEdit) return;
        const prevColor = card.color || "";
        setColorPickerCardId(null);
        if (nextColor === prevColor) return;

        setCards((prev) =>
            prev.map((c) => (c.id === card.id ? { ...c, color: nextColor } : c)),
        );
        try {
            const refs = extractWeeklyPlanRefs(card.content, mentionEntities, card.refs);
            const saved = await saveWeeklyPlanCard({
                id: card.id,
                date: card.date,
                content: card.content,
                position: card.position,
                completed: card.completed,
                color: nextColor,
                refs,
            });
            setCards((prev) => prev.map((c) => (c.id === card.id ? saved : c)));
        } catch (err: any) {
            setCards((prev) =>
                prev.map((c) => (c.id === card.id ? { ...c, color: prevColor } : c)),
            );
            window.showToast?.(
                err?.message ||
                    t("Failed to update card color", "Nepodarilo sa zmeniť farbu karty", "Nem sikerült módosítani a kártya színét"),
                "error",
            );
        }
    };

    const handleDeleteCard = async (card: WeeklyPlanCard) => {
        if (!canEdit) return;
        const snapshot = cards;
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        try {
            await deleteWeeklyPlanCard(card.id);
        } catch (err: any) {
            setCards(snapshot);
            window.showToast?.(
                err?.message ||
                    t("Failed to delete card", "Nepodarilo sa zmazať kartu", "Nem sikerült törölni a kártyát"),
                "error",
            );
        }
    };

    // Day note handlers
    const startEditingNote = (dateIso: string) => {
        if (!canEdit) return;
        setEditingNoteDate(dateIso);
        setNoteDraft(notesByDate[dateIso] || "");
    };

    const commitDayNote = async (dateIso: string) => {
        const nextNote = noteDraft.trim();
        const prevNote = notesByDate[dateIso] || "";
        setEditingNoteDate(null);
        if (nextNote === prevNote.trim()) return;

        setNotesByDate((prev) => ({ ...prev, [dateIso]: nextNote }));
        try {
            await saveWeeklyPlanDayNote(dateIso, nextNote);
        } catch (err: any) {
            setNotesByDate((prev) => ({ ...prev, [dateIso]: prevNote }));
            window.showToast?.(
                err?.message ||
                    t("Failed to save day note", "Nepodarilo sa uložiť poznámku dňa", "Nem sikerült menteni a napi jegyzetet"),
                "error",
            );
        }
    };

    // Drag-and-drop move / rearrange
    const handleDropCard = async (targetDate: string, targetIndex: number | null) => {
        if (!canEdit || !dragCardId) return;
        const dragged = cards.find((c) => c.id === dragCardId);
        setDragCardId(null);
        setDragOverTarget(null);
        if (!dragged) return;

        const sourceDate = dragged.date;
        const sourceList = (cardsByDate[sourceDate] || []).filter((c) => c.id !== dragged.id);
        const destList =
            sourceDate === targetDate
                ? [...sourceList]
                : [...(cardsByDate[targetDate] || [])];

        let insertAt = targetIndex === null ? destList.length : targetIndex;
        if (sourceDate === targetDate) {
            const oldIndex = (cardsByDate[sourceDate] || []).findIndex((c) => c.id === dragged.id);
            if (oldIndex >= 0 && insertAt > oldIndex) {
                insertAt = Math.max(0, insertAt - 1);
            }
        }
        insertAt = Math.max(0, Math.min(insertAt, destList.length));

        const movedCard: WeeklyPlanCard = { ...dragged, date: targetDate };
        destList.splice(insertAt, 0, movedCard);

        const updates: Array<{ id: string; date: string; position: number }> = [];
        const updatedMap = new Map<string, WeeklyPlanCard>();

        destList.forEach((c, idx) => {
            const nextCard = { ...c, date: targetDate, position: idx };
            updatedMap.set(c.id, nextCard);
            updates.push({ id: c.id, date: targetDate, position: idx });
        });

        if (sourceDate !== targetDate) {
            sourceList.forEach((c, idx) => {
                const nextCard = { ...c, date: sourceDate, position: idx };
                updatedMap.set(c.id, nextCard);
                updates.push({ id: c.id, date: sourceDate, position: idx });
            });
        }

        const prevCards = cards;
        setCards((prev) => prev.map((c) => updatedMap.get(c.id) || c));

        try {
            await reorderWeeklyPlanCards(updates);
        } catch (err: any) {
            setCards(prevCards);
            window.showToast?.(
                err?.message ||
                    t("Failed to reorder cards", "Nepodarilo sa preusporiadať karty", "Nem sikerült átrendezni a kártyákat"),
                "error",
            );
        }
    };

    const weekRangeLabel = useMemo(() => {
        const start = parseIsoDate(rangeFrom);
        const end = parseIsoDate(rangeTo);
        const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
        const startFmt = start.toLocaleDateString(dateLocale, {
            day: "numeric",
            month: sameMonth ? undefined : "short",
        });
        const endFmt = end.toLocaleDateString(dateLocale, {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        return `${startFmt} – ${endFmt}`;
    }, [rangeFrom, rangeTo, dateLocale]);

    const chipTypeLabel = (kind: WeeklyPlanRef["kind"]): string => {
        switch (kind) {
            case "project":
                return t("Project", "Projekt", "Projekt");
            case "client":
                return t("Client", "Klient", "Ügyfél");
            case "lead":
                return "Lead";
            case "user":
                return t("Team", "Tím", "Csapat");
            case "employee":
                return t("Employee", "Zamestnanec", "Alkalmazott");
            case "ticket":
                return t("Ticket", "Tiket", "Jegy");
            case "task":
                return t("Task", "Úloha", "Feladat");
            case "tag":
                return t("Tag", "Štítok", "Címke");
        }
    };

    return (
        <div className="space-y-4 select-none" data-testid="weekly-plan-view">
            {/* TOOLBAR */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Prev / Today / Next */}
                    <div className="inline-flex items-center bg-gray-100 p-1 rounded-md border border-gray-200 gap-0.5">
                        <button
                            type="button"
                            onClick={() => setWeekMonday((m) => addLocalDays(m, -7))}
                            data-testid="weekly-plan-prev"
                            className="p-1.5 rounded-md text-gray-600 hover:bg-white hover:text-entity-text transition-colors cursor-pointer"
                            title={t("Previous week", "Predošlý týždeň", "Előző hét")}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setWeekMonday(getMondayOfWeek(new Date()))}
                            data-testid="weekly-plan-today"
                            className="px-2.5 py-1 rounded-md text-ui font-semibold text-gray-700 hover:bg-white hover:text-entity-text transition-colors cursor-pointer"
                        >
                            {t("This week", "Tento týždeň", "Ez a hét")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setWeekMonday((m) => addLocalDays(m, 7))}
                            data-testid="weekly-plan-next"
                            className="p-1.5 rounded-md text-gray-600 hover:bg-white hover:text-entity-text transition-colors cursor-pointer"
                            title={t("Next week", "Ďalší týždeň", "Következő hét")}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Week range & date jumper */}
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-entity-subtle border border-entity-border text-entity-text text-ui font-bold tracking-tight tabular-nums">
                            W{weekNumber}
                        </span>
                        <span className="text-title font-bold text-gray-900" data-testid="weekly-plan-range">
                            {weekRangeLabel}
                        </span>
                        <label
                            className="relative inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 bg-gray-50 hover:bg-entity-subtle hover:border-entity-border text-gray-500 hover:text-entity-text transition-colors cursor-pointer"
                            title={t("Jump to week", "Prejsť na týždeň", "Ugrás hétre")}
                        >
                            <CalendarIcon className="h-3.5 w-3.5 pointer-events-none" />
                            <input
                                type="date"
                                value={formatIsoDate(weekMonday)}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    setWeekMonday(getMondayOfWeek(parseIsoDate(e.target.value)));
                                }}
                                aria-label={t("Jump to date", "Prejsť na dátum", "Ugrás dátumra")}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                        </label>
                    </div>
                </div>

                {/* Right controls: Filter bar toggle + Weekend visibility toggle */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => toggleFilterBarOpen()}
                        data-testid="weekly-plan-filter-toggle"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-ui font-semibold transition-all cursor-pointer ${
                            isFilterBarOpen || activeFilterKeys.size > 0
                                ? "bg-entity-subtle border-entity-border text-entity-text hover:opacity-90"
                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        <span>{t("References", "Referencie", "Hivatkozások")}</span>
                        {filterChips.length > 0 && (
                            <span
                                className={`px-1.5 py-0.2 rounded-md text-micro font-bold tabular-nums ${
                                    activeFilterKeys.size > 0
                                        ? "bg-entity-solid text-white"
                                        : "bg-gray-200 text-gray-700"
                                }`}
                            >
                                {activeFilterKeys.size > 0
                                    ? `${activeFilterKeys.size}/${filterChips.length}`
                                    : filterChips.length}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={showWeekends}
                        onClick={toggleWeekends}
                        data-testid="weekly-plan-weekend-toggle"
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-ui font-semibold transition-all cursor-pointer ${
                            showWeekends
                                ? "bg-entity-subtle border-entity-border text-entity-text hover:opacity-90"
                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>{t("Weekends", "Víkendy", "Hétvége")}</span>
                        <span
                            className={`inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                                showWeekends ? "bg-entity-solid" : "bg-gray-300"
                            }`}
                        >
                            <span
                                className={`inline-block h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${
                                    showWeekends ? "translate-x-3.5" : "translate-x-0.5"
                                }`}
                            />
                        </span>
                    </button>
                </div>
            </div>

            {/* CLOSABLE REFERENCE FILTER BAR */}
            {isFilterBarOpen && (
                <div
                    data-testid="weekly-plan-filter-bar"
                    className="bg-white rounded-lg border border-gray-200 shadow-xs px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150"
                >
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-caption font-semibold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
                            <Filter className="h-3 w-3" />
                            {t("Filter week by:", "Filtrovať týždeň:", "Hét szűrése:")}
                        </span>

                        {filterChips.length === 0 ? (
                            <span className="text-ui text-gray-400 italic">
                                {t(
                                    "Use @ and # inside cards to reference projects, leads, employees, tickets, tasks, or tags — they will appear here.",
                                    "Použite @ a # v kartách na označenie projektov, leadov, zamestnancov, tiketov, úloh alebo štítkov — zobrazia sa tu.",
                                    "Használjon @ és # jeleket a kártyákban projektek, leadek, alkalmazottak, jegyek, feladatok vagy címkék hivatkozásához — itt jelennek meg.",
                                )}
                            </span>
                        ) : (
                            filterChips.map((chip) => {
                                const isActive = activeFilterKeys.has(chip.key);
                                const isTag = chip.kind === "tag";
                                const style =
                                    chip.kind !== "tag" ? MENTION_STYLE_MAP[chip.kind] : null;
                                const IconComp = style ? style.Icon : Hash;
                                return (
                                    <button
                                        key={chip.key}
                                        type="button"
                                        onClick={() => toggleFilterKey(chip.key)}
                                        data-testid={`weekly-plan-chip-${chip.kind}`}
                                        title={`${chipTypeLabel(chip.kind)}: ${chip.label}`}
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-ui font-semibold transition-all cursor-pointer active:scale-95 ${
                                            isActive
                                                ? "bg-gray-900 text-white border-gray-900 shadow-2xs"
                                                : isTag
                                                  ? "bg-entity-subtle text-entity-text border-entity-border hover:opacity-90"
                                                  : `${style?.badgeClass || "bg-gray-100 text-gray-700 border-gray-200"} hover:brightness-95`
                                        }`}
                                    >
                                        <IconComp className="h-3 w-3 shrink-0 opacity-80" />
                                        <span className="truncate max-w-44">
                                            {isTag ? `#${chip.label}` : `@${chip.label}`}
                                        </span>
                                        <span
                                            className={`text-micro px-1 rounded ${
                                                isActive
                                                    ? "bg-white/20 text-white"
                                                    : "bg-black/5 text-gray-500"
                                            }`}
                                        >
                                            {chip.count}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {activeFilterKeys.size > 0 && (
                            <button
                                type="button"
                                onClick={() => setActiveFilterKeys(new Set())}
                                data-testid="weekly-plan-clear-filters"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-ui font-semibold text-gray-500 hover:text-entity-text hover:bg-entity-subtle transition-colors cursor-pointer"
                            >
                                <RotateCcw className="h-3 w-3" />
                                {t("Clear", "Zrušiť", "Törlés")}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => toggleFilterBarOpen(false)}
                            data-testid="weekly-plan-close-filter-bar"
                            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            title={t("Close filter bar", "Zavrieť lištu filtrov", "Szűrősáv bezárása")}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* DAY COLUMNS GRID */}
            <div className="overflow-x-auto pb-2">
                <div
                    className={`grid gap-3 min-w-225 ${
                        showWeekends ? "grid-cols-7" : "grid-cols-5"
                    }`}
                >
                    {weekDates.map((dateIso) => {
                        const dayDate = parseIsoDate(dateIso);
                        const weekdayLabel = dayDate.toLocaleDateString(dateLocale, {
                            weekday: "short",
                        });
                        const dayMonthLabel = dayDate.toLocaleDateString(dateLocale, {
                            day: "numeric",
                            month: "short",
                        });
                        const isToday = dateIso === todayIso;

                        const holidayObj = holidayCal.holiday(dateIso);
                        const overrideObj = holidayCal.override(dateIso);
                        const isHolidayDay = Boolean(
                            holidayObj || overrideObj?.kind === "extraDayOff",
                        );
                        const holidayLabel = holidayObj
                            ? holidayName(
                                  holidayObj,
                                  holidayCountry,
                                  systemLanguage as HolidayLanguage,
                              )
                            : overrideObj?.kind === "extraDayOff"
                              ? overrideObj.name
                              : null;

                        const dayCards = cardsByDate[dateIso] || [];
                        const dayNote = notesByDate[dateIso] || "";
                        const isColumnDragOver =
                            dragOverTarget?.date === dateIso && dragOverTarget.index === null;

                        return (
                            <div
                                key={dateIso}
                                data-testid={`weekly-plan-col-${dateIso}`}
                                data-holiday={isHolidayDay ? "true" : "false"}
                                onDragOver={(e) => {
                                    if (!canEdit || !dragCardId) return;
                                    e.preventDefault();
                                    if (
                                        dragOverTarget?.date !== dateIso ||
                                        dragOverTarget?.index !== null
                                    ) {
                                        setDragOverTarget({ date: dateIso, index: null });
                                    }
                                }}
                                onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        setDragOverTarget((prev) =>
                                            prev?.date === dateIso ? null : prev,
                                        );
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    handleDropCard(dateIso, null);
                                }}
                                style={
                                    isHolidayDay
                                        ? {
                                              backgroundImage:
                                                  "repeating-linear-gradient(-45deg, rgba(245, 158, 11, 0.085) 0px, rgba(245, 158, 11, 0.085) 10px, rgba(255, 255, 255, 0.72) 10px, rgba(255, 255, 255, 0.72) 20px)",
                                          }
                                        : undefined
                                }
                                className={`flex flex-col rounded-lg border min-h-130 transition-colors ${
                                    isColumnDragOver
                                        ? "border-entity-solid ring-2 ring-entity-ring"
                                        : isToday
                                          ? "border-entity-border shadow-xs"
                                          : isHolidayDay
                                            ? "border-amber-200/90"
                                            : "border-gray-200"
                                } ${isHolidayDay ? "bg-amber-50/30" : "bg-white"}`}
                            >
                                {/* DAY HEADER + PER-DAY NOTE UNDER DATE */}
                                <div
                                    className={`p-3 border-b ${
                                        isToday
                                            ? "bg-entity-subtle border-entity-border rounded-t-lg"
                                            : isHolidayDay
                                              ? "bg-amber-50/60 border-amber-200/70 rounded-t-lg"
                                              : "bg-gray-50 border-gray-200 rounded-t-lg"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-baseline gap-1.5 min-w-0">
                                            <span
                                                className={`text-ui font-bold uppercase tracking-wide ${
                                                    isToday
                                                        ? "text-entity-text"
                                                        : isHolidayDay
                                                          ? "text-amber-700"
                                                          : "text-gray-400"
                                                }`}
                                            >
                                                {weekdayLabel}
                                            </span>
                                            <span
                                                className={`text-title font-bold truncate ${
                                                    isToday ? "text-entity-text" : "text-gray-900"
                                                }`}
                                            >
                                                {dayMonthLabel}
                                            </span>
                                        </div>
                                        {isToday && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-entity-solid text-white text-micro font-bold shrink-0">
                                                {t("Today", "Dnes", "Ma")}
                                            </span>
                                        )}
                                    </div>

                                    {isHolidayDay && holidayLabel && (
                                        <div
                                            data-testid={`weekly-plan-holiday-${dateIso}`}
                                            className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/90 border border-amber-300/70 text-amber-900 text-micro font-bold max-w-full"
                                            title={holidayLabel}
                                        >
                                            <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                                            <span className="truncate">{holidayLabel}</span>
                                        </div>
                                    )}

                                    {/* Day note directly underneath the date */}
                                    <div className="mt-2">
                                        {editingNoteDate === dateIso ? (
                                            <input
                                                type="text"
                                                autoFocus
                                                value={noteDraft}
                                                onChange={(e) => setNoteDraft(e.target.value)}
                                                onBlur={() => commitDayNote(dateIso)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        commitDayNote(dateIso);
                                                    } else if (e.key === "Escape") {
                                                        e.preventDefault();
                                                        setEditingNoteDate(null);
                                                    }
                                                }}
                                                data-testid={`weekly-plan-note-input-${dateIso}`}
                                                placeholder={t(
                                                    "Day note...",
                                                    "Poznámka dňa...",
                                                    "Napi jegyzet...",
                                                )}
                                                className="w-full px-2 py-1 rounded-md bg-white border border-entity-border text-ui text-gray-800 focus:outline-none focus:border-entity-solid select-text"
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={!canEdit}
                                                onClick={() => startEditingNote(dateIso)}
                                                data-testid={`weekly-plan-note-${dateIso}`}
                                                className={`w-full text-left flex items-start gap-1.5 px-2 py-1 rounded-md text-ui transition-colors ${
                                                    dayNote
                                                        ? "bg-white/90 border border-gray-200 text-gray-700 font-medium"
                                                        : canEdit
                                                          ? "text-gray-400 hover:bg-white/70 hover:text-gray-600 border border-transparent hover:border-gray-200"
                                                          : "text-gray-300 border border-transparent cursor-default"
                                                }`}
                                            >
                                                <StickyNote className="h-3 w-3 shrink-0 mt-0.5 opacity-60" />
                                                <span className="break-words line-clamp-2 flex-1">
                                                    {dayNote ||
                                                        (canEdit
                                                            ? t(
                                                                  "Add day note...",
                                                                  "Pridať poznámku dňa...",
                                                                  "Napi jegyzet hozzáadása...",
                                                              )
                                                            : "—")}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* CARDS COLUMN + CLICKABLE FREE SPACE */}
                                <div
                                    data-testid={`weekly-plan-free-${dateIso}`}
                                    onClick={(e) => {
                                        // Only trigger rapid creation if clicking empty space in the column body
                                        if (
                                            e.target === e.currentTarget ||
                                            (e.target as HTMLElement).dataset.freeSpace === "true"
                                        ) {
                                            openDraftForDay(dateIso);
                                        }
                                    }}
                                    className={`flex-1 p-2.5 flex flex-col gap-2 ${
                                        canEdit ? "cursor-text" : ""
                                    }`}
                                >
                                    {loading && cards.length === 0 ? (
                                        <div className="space-y-2 py-2">
                                            <div className="h-12 rounded-xl bg-slate-100/70 animate-pulse" />
                                            <div className="h-10 rounded-xl bg-slate-100/50 animate-pulse" />
                                        </div>
                                    ) : null}

                                    {dayCards.map((card, idx) => {
                                        const isEditingThis = editingCardId === card.id;
                                        const isMatched = cardMatchesActiveFilters(
                                            card,
                                            activeFilterKeys,
                                            mentionEntities,
                                        );
                                        const isDimmed =
                                            activeFilterKeys.size > 0 && !isMatched;
                                        const showDropBefore =
                                            dragOverTarget?.date === dateIso &&
                                            dragOverTarget.index === idx;
                                        const colorStyle =
                                            CARD_COLOR_STYLES[card.color || ""] ||
                                            CARD_COLOR_STYLES[""];
                                        const isColorPopoverOpen = colorPickerCardId === card.id;

                                        return (
                                            <div
                                                key={card.id}
                                                data-testid={`weekly-plan-card-${card.id}`}
                                                data-dimmed={isDimmed ? "true" : "false"}
                                                data-color={card.color || ""}
                                                draggable={canEdit && !isEditingThis}
                                                onDragStart={(e) => {
                                                    if (!canEdit || isEditingThis) return;
                                                    setDragCardId(card.id);
                                                    setColorPickerCardId(null);
                                                    e.dataTransfer.effectAllowed = "move";
                                                    e.dataTransfer.setData("text/plain", card.id);
                                                }}
                                                onDragEnd={() => {
                                                    setDragCardId(null);
                                                    setDragOverTarget(null);
                                                }}
                                                onDragOver={(e) => {
                                                    if (!canEdit || !dragCardId || dragCardId === card.id)
                                                        return;
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const rect =
                                                        e.currentTarget.getBoundingClientRect();
                                                    const before =
                                                        e.clientY < rect.top + rect.height / 2;
                                                    const nextIdx = before ? idx : idx + 1;
                                                    if (
                                                        dragOverTarget?.date !== dateIso ||
                                                        dragOverTarget?.index !== nextIdx
                                                    ) {
                                                        setDragOverTarget({
                                                            date: dateIso,
                                                            index: nextIdx,
                                                        });
                                                    }
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const rect =
                                                        e.currentTarget.getBoundingClientRect();
                                                    const before =
                                                        e.clientY < rect.top + rect.height / 2;
                                                    handleDropCard(dateIso, before ? idx : idx + 1);
                                                }}
                                                style={isDimmed ? { opacity: 0.1 } : undefined}
                                                className={`group relative rounded-lg border p-2.5 transition-all duration-200 ${
                                                    isDimmed
                                                        ? "opacity-10"
                                                        : "opacity-100"
                                                } ${
                                                    dragCardId === card.id
                                                        ? "border-entity-solid bg-entity-subtle shadow-sm"
                                                        : `${colorStyle.cardBg} shadow-2xs hover:shadow-xs`
                                                } ${
                                                    showDropBefore
                                                        ? "ring-2 ring-entity-ring ring-offset-1"
                                                        : ""
                                                } ${isColorPopoverOpen ? "z-20" : ""}`}
                                            >
                                                {isEditingThis ? (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="space-y-2"
                                                    >
                                                        <TaskTagMentionInput
                                                            value={editText}
                                                            onChange={setEditText}
                                                            multiline
                                                            rows={2}
                                                            autoFocus
                                                            existingTags={allTags}
                                                            mentionEntities={mentionEntities}
                                                            onAssignEntity={(entity) => {
                                                                setEditRefs((prev) => [
                                                                    ...prev,
                                                                    {
                                                                        kind: entity.type,
                                                                        id: entity.id,
                                                                        label: entity.name.trim(),
                                                                    },
                                                                ]);
                                                            }}
                                                            onSubmitOnEnter={() => commitEditCard(card)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Escape") {
                                                                    e.preventDefault();
                                                                    setEditingCardId(null);
                                                                }
                                                            }}
                                                            onBlur={() => commitEditCard(card)}
                                                            className="w-full px-2 py-1.5 rounded-md border border-entity-border bg-white text-ui text-gray-900 focus:outline-none focus:border-entity-solid resize-none select-text"
                                                        />
                                                        <div className="flex items-center justify-between gap-2 px-0.5">
                                                            <div className="flex items-center gap-1">
                                                                {WEEKLY_PLAN_CARD_COLORS.map((cKey) => {
                                                                    const sw = CARD_COLOR_STYLES[cKey];
                                                                    const active = editColor === cKey;
                                                                    return (
                                                                        <button
                                                                            key={cKey || "default"}
                                                                            type="button"
                                                                            onMouseDown={(e) =>
                                                                                e.preventDefault()
                                                                            }
                                                                            onClick={() =>
                                                                                setEditColor(cKey)
                                                                            }
                                                                            title={t(...sw.label)}
                                                                            className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                                                                                sw.dotBg
                                                                            } ${
                                                                                active
                                                                                    ? "ring-2 ring-gray-800 ring-offset-1 scale-110"
                                                                                    : "hover:scale-110"
                                                                            }`}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                            <span className="text-micro text-gray-400">
                                                                {t(
                                                                    "Enter save · Esc cancel",
                                                                    "Enter uloží · Esc zruší",
                                                                    "Enter ment · Esc mégse",
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {canEdit && (
                                                            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-white/95 rounded-md px-1 py-0.5 shadow-2xs border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span
                                                                    className="p-0.5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                                                                    title={t(
                                                                        "Drag to move",
                                                                        "Presunúť ťahaním",
                                                                        "Húzza az áthelyezéshez",
                                                                    )}
                                                                >
                                                                    <GripVertical className="h-3 w-3" />
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        startEditingCard(card);
                                                                    }}
                                                                    className="p-0.5 rounded text-gray-400 hover:text-entity-text hover:bg-entity-subtle transition-colors cursor-pointer"
                                                                    title={t("Edit", "Upraviť", "Szerkesztés")}
                                                                >
                                                                    <Pencil className="h-3 w-3" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteCard(card);
                                                                    }}
                                                                    data-testid={`weekly-plan-delete-${card.id}`}
                                                                    className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                                    title={t("Delete", "Zmazať", "Törlés")}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        )}

                                                        <div className="flex items-start gap-2">
                                                            <div
                                                                className="relative shrink-0 mt-1"
                                                                onMouseDown={(e) =>
                                                                    e.stopPropagation()
                                                                }
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    disabled={!canEdit}
                                                                    onClick={() =>
                                                                        setColorPickerCardId(
                                                                            (prev) =>
                                                                                prev === card.id
                                                                                    ? null
                                                                                    : card.id,
                                                                        )
                                                                    }
                                                                    data-testid={`weekly-plan-color-${card.id}`}
                                                                    className={`block w-3.5 h-3.5 rounded-full border transition-transform ${
                                                                        colorStyle.dotBg
                                                                    } ${
                                                                        canEdit
                                                                            ? "cursor-pointer hover:scale-110"
                                                                            : "cursor-default"
                                                                    } ${
                                                                        isColorPopoverOpen
                                                                            ? "ring-2 ring-indigo-500/40 ring-offset-1"
                                                                            : ""
                                                                    }`}
                                                                    title={
                                                                        canEdit
                                                                            ? t(
                                                                                  "Change card color",
                                                                                  "Zmeniť farbu karty",
                                                                                  "Kártya színének módosítása",
                                                                              )
                                                                            : undefined
                                                                    }
                                                                />

                                                                {isColorPopoverOpen && canEdit && (
                                                                    <div
                                                                        data-testid={`weekly-plan-color-popover-${card.id}`}
                                                                        className="absolute left-0 top-full mt-1.5 z-30 bg-white rounded-md border border-gray-200 shadow-lg p-1.5 flex items-center gap-1.5"
                                                                    >
                                                                        {WEEKLY_PLAN_CARD_COLORS.map(
                                                                            (cKey) => {
                                                                                const sw =
                                                                                    CARD_COLOR_STYLES[
                                                                                        cKey
                                                                                    ];
                                                                                const active =
                                                                                    (card.color ||
                                                                                        "") ===
                                                                                    cKey;
                                                                                return (
                                                                                    <button
                                                                                        key={
                                                                                            cKey ||
                                                                                            "default"
                                                                                        }
                                                                                        type="button"
                                                                                        data-testid={`weekly-plan-swatch-${cKey || "default"}`}
                                                                                        onClick={() =>
                                                                                            handleChangeCardColor(
                                                                                                card,
                                                                                                cKey,
                                                                                            )
                                                                                        }
                                                                                        title={t(
                                                                                            ...sw.label,
                                                                                        )}
                                                                                        className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                                                                                            sw.dotBg
                                                                                        } ${
                                                                                            active
                                                                                                ? "ring-2 ring-slate-800 ring-offset-1 scale-110"
                                                                                                : "hover:scale-110"
                                                                                        }`}
                                                                                    />
                                                                                );
                                                                            },
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (canEdit)
                                                                        startEditingCard(card);
                                                                }}
                                                                className={`flex-1 min-w-0 text-ui leading-relaxed break-words select-text text-slate-700 font-medium ${
                                                                    canEdit ? "cursor-pointer" : ""
                                                                }`}
                                                            >
                                                                <TaskPillText
                                                                    text={card.content}
                                                                    knownEntities={mentionEntities}
                                                                    onTagClick={handleTagPillClick}
                                                                    onMentionClick={
                                                                        handleMentionPillClick
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* INLINE RAPID-ENTRY DRAFT CARD */}
                                    {draftDate === dateIso && canEdit && (
                                        <div
                                            onClick={(e) => e.stopPropagation()}
                                            data-testid={`weekly-plan-draft-${dateIso}`}
                                            className={`rounded-lg border-2 border-entity-solid p-2.5 shadow-sm space-y-2 animate-in fade-in duration-100 ${
                                                (
                                                    CARD_COLOR_STYLES[draftColor] ||
                                                    CARD_COLOR_STYLES[""]
                                                ).cardBg
                                            }`}
                                        >
                                            <TaskTagMentionInput
                                                value={draftText}
                                                onChange={setDraftText}
                                                multiline
                                                rows={2}
                                                autoFocus
                                                inputRef={(el) => {
                                                    draftInputElRef.current = el;
                                                }}
                                                existingTags={allTags}
                                                mentionEntities={mentionEntities}
                                                onAssignEntity={(entity) => {
                                                    setDraftRefs((prev) => [
                                                        ...prev,
                                                        {
                                                            kind: entity.type,
                                                            id: entity.id,
                                                            label: entity.name.trim(),
                                                        },
                                                    ]);
                                                }}
                                                onSubmitOnEnter={() => commitDraft(true)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        e.preventDefault();
                                                        setDraftDate(null);
                                                        setDraftText("");
                                                        setDraftRefs([]);
                                                        setDraftColor("");
                                                    }
                                                }}
                                                onBlur={() => commitDraft(false)}
                                                placeholder={t(
                                                    "Type card goal... (@ to mention, # for tag)",
                                                    "Napíšte cieľ... (@ pre odkaz, # pre štítok)",
                                                    "Írja be a célt... (@ említés, # címke)",
                                                )}
                                                className="w-full px-1.5 py-1 rounded-md bg-white/80 text-ui text-gray-900 placeholder:text-gray-400 focus:outline-none resize-none select-text"
                                            />
                                            <div className="flex items-center justify-between gap-2 px-1">
                                                <div className="flex items-center gap-1">
                                                    {WEEKLY_PLAN_CARD_COLORS.map((cKey) => {
                                                        const sw = CARD_COLOR_STYLES[cKey];
                                                        const active = draftColor === cKey;
                                                        return (
                                                            <button
                                                                key={cKey || "default"}
                                                                type="button"
                                                                onMouseDown={(e) =>
                                                                    e.preventDefault()
                                                                }
                                                                onClick={() => setDraftColor(cKey)}
                                                                title={t(...sw.label)}
                                                                className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                                                                    sw.dotBg
                                                                } ${
                                                                    active
                                                                        ? "ring-2 ring-gray-800 ring-offset-1 scale-110"
                                                                        : "hover:scale-110"
                                                                }`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                                <span className="text-micro text-gray-400">
                                                    {t(
                                                        "Enter: save & next · Esc: close",
                                                        "Enter: uložiť a ďalšia · Esc: zavrieť",
                                                        "Enter: mentés és következő · Esc: bezárás",
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* FREE SPACE HINT / CLICK AREA AT BOTTOM */}
                                    {canEdit && (
                                        <div
                                            data-free-space="true"
                                            className="flex-1 min-h-20 rounded-md flex items-start justify-center pt-3 opacity-0 hover:opacity-100 transition-opacity"
                                        >
                                            <span
                                                data-free-space="true"
                                                className="inline-flex items-center gap-1 text-micro font-semibold text-gray-400 pointer-events-none"
                                            >
                                                <Plus className="h-3 w-3" />
                                                {t(
                                                    "Click free space to add card",
                                                    "Kliknutím na voľné miesto pridáte kartu",
                                                    "Kattintson az üres helyre kártya hozzáadásához",
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
