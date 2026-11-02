import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Calendar,
    Check,
    ChevronDown,
    ClipboardCheck,
    Clock,
    Folder,
    Loader2,
    Lock,
    Mail,
    Mic,
    Plus,
    Repeat,
    Search,
    UserRound,
    X,
} from "lucide-react";
import type { Lead, Project, RecurringTaskTemplate, Task, TaskEmailReminder, TaskRecurrence, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect, type DropdownOption } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { taskEmailReminderHint } from "./TaskEmailReminderField";
import { useTaskSettings } from "../hooks/useTaskSettings";
import { TaskTagMentionInput } from "./TaskTagMentionInput";
import { extractTagsFromText, type MentionEntity } from "./TaskPillText";
import { projectDisplayName } from "../utils/projects";
import { staleLeadIdsForTasks } from "../utils/taskLeadPicker";
import { isClientRecord } from "../utils/clientRecord";
import { taskPriorityLabel } from "../utils/taskLabels";
import { TASK_EMAIL_REMINDERS, withTaskReminder } from "../utils/taskReminders";
import { TaskRecurrenceFields, createDefaultRecurrence } from "./TaskRecurrenceFields";
import { describeRecurrence, describeRecurrenceWithEnd } from "../utils/recurringTasks";
import { useTaskDictation, DICTATION_BARS, type DictationResult } from "../hooks/useTaskDictation";
import { viewSizeScale } from "../utils/viewSize";

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

type Translate = (en: string, sk: string, hu: string) => string;
type Priority = "low" | "medium" | "high";

/**
 * The button that opened the composer, so the card can grow out of it (and
 * shrink back into it): its rect and the click point, in viewport pixels.
 * `create` and `mic` are the two buttons of the closed bar, whose colour and
 * label the card wears while it grows; `plain` is any other opener.
 */
export interface ComposerOrigin {
    kind: "create" | "mic" | "plain";
    rect: { left: number; top: number; width: number; height: number };
    x: number;
    y: number;
}

/** The origin of a click on `e.currentTarget`. Keyboard clicks (no pointer position) land in its centre. */
export const composerOriginFrom = (
    e: React.MouseEvent<HTMLElement> | undefined | null,
    kind: ComposerOrigin["kind"],
    el?: HTMLElement | null,
): ComposerOrigin | undefined => {
    const target = (e?.currentTarget as HTMLElement | undefined) || el || undefined;
    if (!target || typeof target.getBoundingClientRect !== "function") return undefined;
    const r = target.getBoundingClientRect();
    const hasPoint = !!e && (e.clientX !== 0 || e.clientY !== 0);
    return {
        kind,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        x: hasPoint ? e!.clientX : r.left + r.width / 2,
        y: hasPoint ? e!.clientY : r.top + r.height / 2,
    };
};

const COPY_CREATED = {
    one: (t: Translate) => t("Task created", "Úloha vytvorená", "Feladat létrehozva"),
    many: (t: Translate, n: number) => t(`${n} tasks created`, `${skTasks(n)} vytvorené`, `${n} feladat létrehozva`),
};

/**
 * The "Task created" pill from the motion board. Lives outside React so it
 * outlasts the composer that triggered it.
 */
export const showComposerToast = (text: string, at?: { x: number; y: number }) => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("role", "status");
    el.className =
        "nt-toast fixed z-[100002] h-11 pl-3 pr-4 rounded-full bg-slate-900 text-white text-ui font-semibold flex items-center gap-2.5 shadow-[0_10px_25px_-8px_rgba(0,0,0,0.35)] whitespace-nowrap pointer-events-none";
    el.style.left = `${at ? at.x : window.innerWidth / 2}px`;
    el.style.top = `${at ? at.y : 104}px`;
    const badge = document.createElement("span");
    badge.className = "w-5.5 h-5.5 rounded-full bg-green-600 flex items-center justify-center shrink-0";
    badge.innerHTML =
        '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
    const label = document.createElement("span");
    label.textContent = text;
    el.append(badge, label);
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 2600);
};

// Task deadlines are plain local dates, so never go through toISOString() (UTC).
const toLocalDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const parseLocalDate = (s: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const LOCALE: Record<string, string> = { sk: "sk-SK", hu: "hu-HU", en: "en-GB" };

/** "po 2. 11. 2026" */
const formatDeadline = (date: string, lang: Language): string => {
    const d = parseLocalDate(date);
    if (!d) return date;
    return d.toLocaleDateString(LOCALE[lang] || LOCALE.en, { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });
};

/** Slovak "1 úloha / 3 úlohy / 5 úloh". */
const skTasks = (n: number) => `${n} ${n === 1 ? "úloha" : n >= 2 && n <= 4 ? "úlohy" : "úloh"}`;
const countLabel = (n: number, t: Translate) => t(`${n} ${n === 1 ? "task" : "tasks"}`, skTasks(n), `${n} feladat`);

const TIME_PRESETS = ["09:00", "10:00", "12:00", "14:00", "16:00", "17:00", "19:00"];
const timeName = (time: string, t: Translate): string => {
    switch (time) {
        case "09:00":
            return t("Early morning", "Skoro ráno", "Kora reggel");
        case "10:00":
            return t("Morning", "Ráno", "Reggel");
        case "12:00":
            return t("Noon", "Poludnie", "Dél");
        case "14:00":
            return t("Early afternoon", "Skoré popoludnie", "Kora délután");
        case "16:00":
            return t("Afternoon", "Popoludnie", "Délután");
        case "17:00":
            return t("End of day", "Koniec dňa", "Nap vége");
        case "19:00":
            return t("Evening", "Večer", "Este");
        default:
            return "";
    }
};

const PRIORITY_DOT: Record<Priority, string> = { low: "bg-slate-400", medium: "bg-amber-500", high: "bg-rose-600" };

const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const reminderTiming = (when: TaskEmailReminder, t: Translate) =>
    when === "morning"
        ? t("Morning of the due day", "Ráno v deň termínu", "A határidő napján reggel")
        : when === "1h"
          ? t("1 hour before the deadline", "1 hodinu pred termínom", "1 órával a határidő előtt")
          : t("1 day before the deadline", "1 deň pred termínom", "1 nappal a határidő előtt");

const reminderChip = (when: TaskEmailReminder, t: Translate) =>
    when === "morning"
        ? t("E-mail on the due morning", "E-mail ráno v deň termínu", "E-mail a határidő reggelén")
        : when === "1h"
          ? t("E-mail 1 hour before", "E-mail 1 hodinu pred", "E-mail 1 órával előtte")
          : t("E-mail 1 day before", "E-mail 1 deň pred", "E-mail 1 nappal előtte");

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces (all from the design)                         */
/* -------------------------------------------------------------------------- */

const Kbd: React.FC<{ children: React.ReactNode; white?: boolean }> = ({ children, white }) => (
    <kbd
        className={`font-[inherit] text-micro font-semibold px-1.5 py-px border border-slate-200 border-b-2 rounded-md text-slate-600 ${
            white ? "bg-white" : "bg-slate-50"
        }`}
    >
        {children}
    </kbd>
);

/** The blue mic badge on a label whose field the dictation filled. */
const DictatedBadge: React.FC<{ label: string }> = ({ label }) => (
    <span
        aria-label={label}
        title={label}
        className="h-4.5 px-1.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center"
    >
        <Mic aria-hidden="true" className="h-2.75 w-2.75" strokeWidth={2.5} />
    </span>
);

const Overline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="m-0 type-overline text-slate-500">{children}</h3>
);

const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string; id?: string; badge?: string | false }> = ({
    children,
    htmlFor,
    id,
    badge,
}) => {
    const cls = "type-label text-slate-600 flex items-center gap-1.5";
    const content = (
        <>
            {children}
            {badge ? <DictatedBadge label={badge} /> : null}
        </>
    );
    return htmlFor ? (
        <label htmlFor={htmlFor} id={id} className={cls}>
            {content}
        </label>
    ) : (
        <span id={id} className={cls}>
            {content}
        </span>
    );
};

const Switch: React.FC<{ on: boolean; label: string; onToggle: () => void; testId?: string; disabled?: boolean }> = ({
    on,
    label,
    onToggle,
    testId,
    disabled,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={onToggle}
        className={`w-11 h-6.5 shrink-0 border-0 p-0.75 rounded-full flex items-center transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5d00] ${
            on ? "bg-[#ff5d00]" : "bg-slate-300"
        }`}
    >
        <span
            aria-hidden="true"
            className={`w-5 h-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                on ? "translate-x-4.5" : "translate-x-0"
            }`}
        />
    </button>
);

const OptionRow: React.FC<{
    icon: React.ReactNode;
    title: string;
    hint: string;
    hintWarn?: boolean;
    on: boolean;
    onToggle: () => void;
    testId?: string;
    switchTestId?: string;
    disabled?: boolean;
    children?: React.ReactNode;
}> = ({ icon, title, hint, hintWarn, on, onToggle, testId, switchTestId, disabled, children }) => (
    <div data-testid={testId} className="px-3.5 py-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-white text-slate-600 flex items-center justify-center shrink-0">{icon}</span>
            <div className="flex-grow min-w-0">
                <div className="text-ui font-semibold text-slate-800">{title}</div>
                <div className={`text-micro ${hintWarn ? "text-amber-700" : "text-slate-500"}`}>{hint}</div>
            </div>
            <Switch on={on} label={title} onToggle={onToggle} testId={switchTestId} disabled={disabled} />
        </div>
        {on && children}
    </div>
);

const OptionDivider = () => <div className="h-px bg-[#eef2f6] dark:bg-slate-200 mx-3.5" />;

/** Box of a field in the Kedy / Kto a k čomu grids. */
const FIELD_BOX =
    "w-full h-10 px-3 rounded-xl text-ui text-slate-800 flex items-center gap-2 text-left cursor-pointer transition-[border-color,box-shadow] duration-150";
const fieldSkin = (dictated: boolean) =>
    dictated ? "border border-blue-200 bg-[#f8fbff] dark:bg-blue-50 nt-fill" : "border border-slate-200 bg-white hover:border-slate-300";
/** A CustomSelect trigger dressed as one of the design's field boxes. */
const selectSkin = (dictated: boolean, extra = "") =>
    `${FIELD_BOX} justify-between ${fieldSkin(dictated)} ${extra} [&>span]:gap-2`;

/* -------------------------------------------------------------------------- */
/*  The composer                                                              */
/* -------------------------------------------------------------------------- */

type DictField = "title" | "description" | "deadline" | "time" | "priority" | "assignee" | "lead";

interface QuickTaskModalProps {
    /** Existing tasks, only to offer their tags in the # picker. */
    tasks: Task[];
    leads: Lead[];
    projects?: Project[];
    users: UserProfile[];
    taskStates: string[];
    systemLanguage: Language;
    /** The person creating the task; also the default assignee. */
    currentUserName: string;
    mailConfigured?: boolean;
    leadStageGroups?: Record<string, string>;
    leadStateParents?: Record<string, string>;
    /** Pre-filled deadline (the calendar's "+" on a day); defaults to today. */
    initialDeadline?: string;
    /**
     * Text arriving from outside (a shortcut, the share target, the bookmarklet).
     * Fills the title on open; a new `id` while the form is already open adds the
     * text as another line, so a half-typed task is never overwritten.
     */
    incomingTitle?: { id: number; text: string };
    /** Receives the new tasks (one per title line); persisting them is the caller's job. */
    onCreate: (tasks: Task[]) => void;
    /**
     * Receives a recurring series template (one per title line) when "Repeat" is
     * on; the server generates its occurrences (see docs/RECURRING-TASKS.md).
     * Left out, the composer offers no "Repeat" option.
     */
    onCreateRecurring?: (template: RecurringTaskTemplate) => void;
    /** Opens with "Repeat" already on (the Recurring tab's "New recurring task"). */
    initialRepeat?: boolean;
    onClose: () => void;
    /** Renders in place (where the closed bar was) instead of floating under the header. */
    inline?: boolean;
    /** The button that opened it; the card grows out of it and shrinks back into it. */
    origin?: ComposerOrigin;
    /** Start dictating as soon as it opens (the bar's "Dictate" button). */
    startDictation?: boolean;
}

/**
 * New-task composer ("New Task Modal Redesign"). By default a card that floats
 * under the header, opened by the header button on any page without
 * navigating. With `inline` it takes the place of the Tasks page's closed bar.
 *
 * One card for typing and dictating: the header's Dictate button records,
 * the server transcribes, and the fields fill in (marked "from dictation") for
 * review. Several title lines are several tasks; the shared settings below
 * apply to all of them.
 */
export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({
    tasks,
    leads,
    projects = [],
    users,
    taskStates,
    systemLanguage,
    currentUserName,
    mailConfigured = true,
    leadStageGroups,
    leadStateParents,
    initialDeadline,
    incomingTitle,
    onCreate,
    onCreateRecurring,
    initialRepeat = false,
    onClose,
    inline = false,
    origin,
    startDictation = false,
}) => {
    const t: Translate = (en, sk, hu) => (systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en);
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

    /* ----------------------------- form state ----------------------------- */
    const [title, setTitle] = useState(() => incomingTitle?.text ?? "");
    // StrictMode runs effects twice; remember which delivery was applied already.
    const appliedIncomingRef = useRef<number | null>(incomingTitle?.id ?? null);
    useEffect(() => {
        if (!incomingTitle || appliedIncomingRef.current === incomingTitle.id) return;
        appliedIncomingRef.current = incomingTitle.id;
        if (!incomingTitle.text) return;
        setTitle((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n" + incomingTitle.text : incomingTitle.text));
    }, [incomingTitle]);

    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<Priority>("medium");
    const [deadline, setDeadline] = useState(() => initialDeadline || toLocalDateStr(new Date()));
    const [deadlineTime, setDeadlineTime] = useState("16:00");
    const [customTime, setCustomTime] = useState(false);
    const [relatedLeadId, setRelatedLeadId] = useState("");
    const [relatedProjectId, setRelatedProjectId] = useState("");
    const [isLocking, setIsLocking] = useState(false);
    const { offerConclusion, defaultRequiresConclusion } = useTaskSettings();
    const [requiresConclusion, setRequiresConclusion] = useState(() => Boolean(defaultRequiresConclusion));
    const [emailReminders, setEmailReminders] = useState<Task["emailReminders"]>(undefined);
    const [assignedUser, setAssignedUser] = useState(currentUserName || users[0]?.name || "");
    const canRepeat = Boolean(onCreateRecurring);
    const [repeat, setRepeat] = useState(() => canRepeat && Boolean(initialRepeat));
    const [recurrence, setRecurrence] = useState<TaskRecurrence>(() =>
        createDefaultRecurrence(initialDeadline || toLocalDateStr(new Date())),
    );
    const toggleRepeat = () =>
        setRepeat((on) => {
            // A fresh rule starts from the deadline that is set at the time.
            if (!on) setRecurrence(createDefaultRecurrence(deadline));
            return !on;
        });
    const recLang = (systemLanguage === "sk" || systemLanguage === "hu" ? systemLanguage : "en") as "en" | "sk" | "hu";

    const rows = title.split("\n");
    const lineCount = rows.filter((line) => line.trim().length > 0).length;
    const isMulti = rows.length > 1;
    const manyTasks = lineCount > 1;
    const [summaryExpanded, setSummaryExpanded] = useState(false);
    const collapsed = manyTasks && !summaryExpanded;

    /* ------------------------------ dictation ----------------------------- */
    const [dictated, setDictated] = useState<Set<DictField>>(() => new Set());
    const [fillKey, setFillKey] = useState(0);
    const [stripLeaving, setStripLeaving] = useState(false);
    const usedDictationRef = useRef(false);
    const clearDictated = (field: DictField) =>
        setDictated((prev) => {
            if (!prev.has(field)) return prev;
            const next = new Set(prev);
            next.delete(field);
            return next;
        });

    const leadNames = useMemo(
        () =>
            Array.from(new Set(leads.filter((l) => !l.archived && l.name).map((l) => l.name))).slice(0, 400),
        [leads],
    );
    const userNames = useMemo(() => users.map((u) => u.name), [users]);

    const applyDictation = (result: DictationResult) => {
        const items = result.tasks.filter((item) => String(item.title || "").trim());
        if (items.length === 0) return;
        const first = items[0];
        const filled = new Set<DictField>(["title"]);
        if (items.length > 1) {
            setTitle(items.map((item) => String(item.title).trim()).join("\n"));
            setDescription("");
        } else {
            setTitle(String(first.title).trim());
            if (first.description && String(first.description).trim()) {
                setDescription(String(first.description).trim());
                filled.add("description");
            }
        }
        if (first.deadline && parseLocalDate(first.deadline)) {
            setDeadline(first.deadline);
            filled.add("deadline");
        }
        if (first.deadlineTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(first.deadlineTime)) {
            setDeadlineTime(first.deadlineTime);
            setCustomTime(!TIME_PRESETS.includes(first.deadlineTime));
            filled.add("time");
        }
        const prio = first.priority === "high" || first.priority === "urgent" ? "high" : first.priority === "low" ? "low" : "medium";
        setPriority(prio);
        filled.add("priority");
        if (first.assignedTo) {
            const match = users.find((u) => fold(u.name) === fold(String(first.assignedTo)));
            if (match) {
                setAssignedUser(match.name);
                filled.add("assignee");
            }
        }
        if (first.lead) {
            const wanted = fold(String(first.lead));
            const live = leads.filter((l) => !l.archived);
            const match =
                live.find((l) => fold(l.name) === wanted) ||
                live.find((l) => fold(l.name).includes(wanted) || (wanted.length > 3 && wanted.includes(fold(l.name))));
            if (match) {
                setRelatedLeadId(match.id);
                filled.add("lead");
            }
        }
        usedDictationRef.current = true;
        setDictated(filled);
        setFillKey((k) => k + 1);
    };

    const pendingResultRef = useRef<DictationResult | null>(null);
    const foldStrip = (then?: () => void) => {
        setStripLeaving(true);
        window.setTimeout(() => {
            setStripLeaving(false);
            then?.();
        }, 420);
    };
    const dictation = useTaskDictation({
        language: systemLanguage,
        users: userNames,
        leads: leadNames,
        t,
        onResult: (result) => {
            pendingResultRef.current = result;
            // Play the finish animation first, then hand the fields their values.
            foldStrip(() => {
                if (pendingResultRef.current) applyDictation(pendingResultRef.current);
                pendingResultRef.current = null;
            });
        },
        onError: (message) => {
            foldStrip();
            (window as any).showToast?.(message, "error");
        },
    });
    const isRecording = dictation.phase === "recording";
    const isProcessing = dictation.phase === "processing";
    const showStrip = isRecording || isProcessing || stripLeaving;

    // Typing starts in the title, unless the card opened to dictate.
    useEffect(() => {
        if (startDictation) return;
        const id = window.setTimeout(() => singleRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startedDictationRef = useRef(false);
    useEffect(() => {
        if (!startDictation || startedDictationRef.current) return;
        startedDictationRef.current = true;
        void dictation.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDictation]);

    /* ------------------------------- motion ------------------------------- */
    const cardRef = useRef<HTMLElement | null>(null);
    const [motion, setMotion] = useState<null | {
        from: string;
        box: { left: number; top: number; width: number; height: number };
        cx: number;
        cy: number;
    }>(null);
    const [entering, setEntering] = useState(!!origin);
    const [closing, setClosing] = useState(false);
    const closeTimerRef = useRef<number | null>(null);

    useLayoutEffect(() => {
        if (!origin || !cardRef.current) {
            setEntering(false);
            return;
        }
        const card = cardRef.current.getBoundingClientRect();
        const w = Math.min(origin.rect.width, card.width);
        const h = Math.min(origin.rect.height, card.height);
        // The button's rect in the card's coordinates, kept inside the card: a
        // header button above a floating card grows down out of the card's top edge.
        const left = Math.max(0, Math.min(origin.rect.left - card.left, card.width - w));
        const top = Math.max(0, Math.min(origin.rect.top - card.top, card.height - h));
        const right = card.width - left - w;
        const bottom = card.height - top - h;
        setMotion({
            from: `inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`,
            box: { left, top, width: w, height: h },
            cx: Math.max(0, Math.min(origin.x - card.left, card.width)),
            cy: Math.max(0, Math.min(origin.y - card.top, card.height)),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => () => {
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    }, []);

    /** Where the toast goes: under the bar the card shrinks back into, or over the card. */
    const toastAnchor = (stayingOpen: boolean): { x: number; y: number } | undefined => {
        const card = cardRef.current?.getBoundingClientRect();
        if (!card) return undefined;
        const scale = viewSizeScale();
        if (stayingOpen) {
            const below = card.bottom + 12 * scale;
            return { x: card.left + card.width / 2, y: Math.min(below, window.innerHeight - 56 * scale) };
        }
        if (motion && origin && origin.kind !== "plain") {
            return { x: card.left + card.width / 2, y: card.top + motion.box.top + motion.box.height + 20 * scale };
        }
        return { x: card.left + card.width / 2, y: card.top + 20 * scale };
    };

    const requestClose = useCallback(
        (toast?: string) => {
            if (closing) return;
            dictation.cancel();
            const anchor = toast ? toastAnchor(false) : undefined;
            if (!motion) {
                onClose();
                if (toast) showComposerToast(toast, anchor);
                return;
            }
            setClosing(true);
            closeTimerRef.current = window.setTimeout(() => {
                onClose();
                if (toast) showComposerToast(toast, anchor);
            }, 340);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [closing, motion, onClose],
    );

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (prioOpenRef.current) {
                setPrioOpen(false);
                return;
            }
            requestClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [requestClose]);

    /* --------------------------- tags & mentions -------------------------- */
    const existingTags = useMemo(() => {
        const tagSet = new Set<string>();
        tasks.forEach((tk) => {
            (tk.tags || []).forEach((tag) => tagSet.add(tag));
            extractTagsFromText(tk.title || "").forEach((tag) => tagSet.add(tag));
            extractTagsFromText(tk.description || "").forEach((tag) => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [tasks]);

    const mentionEntities: MentionEntity[] = useMemo(() => {
        const list: MentionEntity[] = users.map((u) => ({
            id: u.name,
            name: u.name,
            type: "user",
            detail: u.role || "Team member",
        }));
        projects.forEach((p) => {
            list.push({
                id: p.id,
                name: projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt")),
                type: "project",
                detail: p.status || "Project",
            });
        });
        leads.forEach((l) => {
            list.push(
                isClientRecord(l)
                    ? { id: l.id, name: l.name, type: "client", detail: l.city || "Client" }
                    : { id: l.id, name: l.name, type: "lead", detail: l.status || "Lead" },
            );
        });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users, projects, leads, systemLanguage]);

    const onAssignEntity = (entity: MentionEntity) => {
        if (entity.type === "user") {
            setAssignedUser(entity.name);
            clearDictated("assignee");
        } else if (entity.type === "project") {
            setRelatedProjectId(entity.id);
        } else if (entity.type === "client" || entity.type === "lead") {
            setRelatedLeadId(entity.id);
            clearDictated("lead");
        }
    };

    /* ----------------------------- title rows ----------------------------- */
    const singleRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const rowRefs = useRef<Array<HTMLInputElement | HTMLTextAreaElement | null>>([]);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [focusRequest, setFocusRequest] = useState<{ index: number; caret: number; n: number } | null>(null);

    useEffect(() => {
        if (!focusRequest) return;
        const el = rows.length > 1 ? rowRefs.current[focusRequest.index] : singleRef.current;
        if (!el) return;
        el.focus();
        try {
            el.setSelectionRange(focusRequest.caret, focusRequest.caret);
        } catch {
            /* not a text field */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusRequest]);

    const focusRow = (index: number, caret: number) => {
        setFocusedRow(index);
        setFocusRequest((prev) => ({ index, caret, n: (prev?.n ?? 0) + 1 }));
    };

    const setRows = (next: string[]) => {
        setTitle(next.join("\n"));
        clearDictated("title");
    };

    /** Shift+Enter: the caret's line splits into two tasks. */
    const splitAt = (index: number, el: HTMLInputElement | HTMLTextAreaElement) => {
        const pos = el.selectionStart ?? rows[index].length;
        const end = el.selectionEnd ?? pos;
        const line = rows[index];
        const next = [...rows];
        next.splice(index, 1, line.slice(0, pos), line.slice(end));
        setRows(next);
        focusRow(index + 1, 0);
    };

    const onSingleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.shiftKey) splitAt(0, e.target as HTMLTextAreaElement);
        else createTasks(true);
    };

    const onRowKeyDown = (index: number) => (e: React.KeyboardEvent) => {
        const el = e.target as HTMLInputElement;
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) splitAt(index, el);
            else createTasks(true);
            return;
        }
        if (e.key === "Backspace" && index > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
            e.preventDefault();
            const caret = rows[index - 1].length;
            const next = [...rows];
            next.splice(index - 1, 2, rows[index - 1] + rows[index]);
            setRows(next);
            focusRow(next.length > 1 ? index - 1 : 0, caret);
            return;
        }
        if (e.key === "Delete" && index < rows.length - 1 && el.selectionStart === rows[index].length && el.selectionEnd === rows[index].length) {
            e.preventDefault();
            const caret = rows[index].length;
            const next = [...rows];
            next.splice(index, 2, rows[index] + rows[index + 1]);
            setRows(next);
            focusRow(next.length > 1 ? index : 0, caret);
            return;
        }
        if (e.key === "ArrowUp" && index > 0) {
            e.preventDefault();
            focusRow(index - 1, Math.min(el.selectionStart ?? 0, rows[index - 1].length));
        } else if (e.key === "ArrowDown" && index < rows.length - 1) {
            e.preventDefault();
            focusRow(index + 1, Math.min(el.selectionStart ?? 0, rows[index + 1].length));
        }
    };

    /* ------------------------------ priority ------------------------------ */
    const [prioOpen, setPrioOpen] = useState(false);
    const prioOpenRef = useRef(false);
    prioOpenRef.current = prioOpen;
    const prioRef = useRef<HTMLDivElement | null>(null);
    const prioButtonRef = useRef<HTMLButtonElement | null>(null);
    const prioMenuRef = useRef<HTMLDivElement | null>(null);
    // The menu is portaled (the floating card's body scrolls and would crop it),
    // so it is placed under the button in viewport pixels.
    const [prioBox, setPrioBox] = useState<{ left: number; top: number; width: number } | null>(null);
    const [prioActive, setPrioActive] = useState(1);
    const PRIORITIES: Priority[] = ["low", "medium", "high"];
    useEffect(() => {
        if (!prioOpen) return;
        setPrioActive(PRIORITIES.indexOf(priority));
        const place = () => {
            const r = prioButtonRef.current?.getBoundingClientRect();
            if (r) setPrioBox({ left: r.left, top: r.bottom + 8 * viewSizeScale(), width: r.width });
        };
        place();
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (prioRef.current?.contains(target) || prioMenuRef.current?.contains(target)) return;
            setPrioOpen(false);
        };
        document.addEventListener("mousedown", onDown, true);
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            document.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prioOpen]);
    const pickPriority = (p: Priority) => {
        setPriority(p);
        setPrioOpen(false);
        clearDictated("priority");
    };
    const onPrioKeyDown = (e: React.KeyboardEvent) => {
        if (!prioOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setPrioOpen(true);
            return;
        }
        if (!prioOpen) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setPrioActive((i) => Math.min(i + 1, 2));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setPrioActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickPriority(PRIORITIES[prioActive]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setPrioOpen(false);
        }
    };

    /* -------------------------------- dates ------------------------------- */
    const dateInputRef = useRef<HTMLInputElement | null>(null);
    const today = new Date();
    const quickDates = (() => {
        const dow = today.getDay();
        const toFriday = dow < 5 ? 5 - dow : 12 - dow;
        return [
            { id: "today", label: t("Today", "Dnes", "Ma"), date: toLocalDateStr(today) },
            { id: "tomorrow", label: t("Tomorrow", "Zajtra", "Holnap"), date: toLocalDateStr(addDays(today, 1)) },
            { id: "friday", label: t("Friday", "Piatok", "Péntek"), date: toLocalDateStr(addDays(today, toFriday)) },
            { id: "week", label: t("In a week", "O týždeň", "Egy hét múlva"), date: toLocalDateStr(addDays(today, 7)) },
        ];
    })();
    const changeDeadline = (date: string) => {
        if (!date) return;
        setDeadline(date);
        clearDictated("deadline");
    };
    const openDatePicker = () => {
        const el = dateInputRef.current;
        if (!el) return;
        try {
            if (typeof (el as any).showPicker === "function") (el as any).showPicker();
            else el.focus();
        } catch {
            el.focus();
        }
    };

    const timeOptions: DropdownOption[] = [
        ...(deadlineTime === "" ? [{ value: "", label: t("No time · 23:59", "Bez času · 23:59", "Nincs idő · 23:59") }] : []),
        ...TIME_PRESETS.map((p) => ({ value: p, label: `${timeName(p, t)} · ${p}` })),
        { value: "custom", label: t("Custom time…", "Vlastný čas…", "Egyéni időpont…") },
    ];

    /* ------------------------------ assignee ------------------------------ */
    const meLabel = t("Me", "Ja", "Én");
    const personLabel = (name: string) => (name && name === currentUserName ? meLabel : name);
    const personInitials = (name: string) => (name && name === currentUserName ? t("ME", "JA", "ÉN") : initialsOf(name));
    const avatar = (name: string, small?: boolean) =>
        name ? (
            <span
                className={`${small ? "w-5.5 h-5.5" : "w-6.5 h-6.5"} rounded-full bg-orange-100 text-orange-800 text-micro font-bold flex items-center justify-center shrink-0`}
            >
                {personInitials(name)}
            </span>
        ) : (
            <span
                className={`${small ? "w-5.5 h-5.5" : "w-6.5 h-6.5"} rounded-full border border-dashed border-slate-300 text-slate-400 flex items-center justify-center shrink-0`}
            >
                <UserRound className="h-3.5 w-3.5" />
            </span>
        );
    const assigneeOptions: DropdownOption[] = [
        { value: "", label: t("Unassigned", "Nepriradený", "Kijelöletlen"), icon: avatar("") },
        ...users.map((u) => ({
            value: u.name,
            label: personLabel(u.name),
            searchText: `${u.name} ${u.role || ""}`,
            icon: avatar(u.name),
        })),
    ];

    /* ----------------------------- lead / project ------------------------- */
    const selectedLead = relatedLeadId ? leads.find((l) => l.id === relatedLeadId) : undefined;
    const selectedProject = relatedProjectId ? projects.find((p) => p.id === relatedProjectId) : undefined;
    const projectLabel = (p: Project) => projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"));
    const projectOptions: DropdownOption[] = [
        { value: "", label: t("None", "Žiadny", "Nincs") },
        ...projects.map((p) => ({ value: p.id, label: projectLabel(p) })),
    ];

    /* ------------------------------- options ------------------------------ */
    const mine = currentUserName ? emailReminders?.[currentUserName] : undefined;
    const myEmail = users.find((u) => u.name === currentUserName)?.email || "";
    const reminderInfo = taskEmailReminderHint({
        task: { deadline, deadlineTime },
        mine,
        myEmail,
        mailConfigured,
        systemLanguage,
        t,
    });
    const setReminder = (when: TaskEmailReminder | null) => setEmailReminders(withTaskReminder(emailReminders, currentUserName, when));
    const repeatHint = repeat
        ? describeRecurrenceWithEnd(recurrence, recLang)
        : t("Does not repeat", "Neopakuje sa", "Nem ismétlődik");

    /* ------------------------------- create ------------------------------- */
    const createTasks = (closeAfterCreate: boolean) => {
        const lines = rows.map((line) => line.trim()).filter((line) => line.length > 0);
        if (lines.length === 0) {
            (window as any).showToast?.(
                t("Please enter a task title!", "Prosím zadajte názov úlohy!", "Kérjük, adja meg a feladat címét!"),
                "warning",
            );
            focusRow(0, 0);
            return;
        }
        if (isRecording || isProcessing) dictation.cancel();

        const now = Date.now();

        // "Repeat": each line becomes a series template; the server creates its tasks.
        if (repeat && onCreateRecurring) {
            lines.forEach((line, index) => {
                onCreateRecurring({
                    id: `task-template-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    title: line,
                    description: index === 0 ? description.trim() : "",
                    tags: Array.from(new Set([...extractTagsFromText(line), ...(index === 0 ? extractTagsFromText(description) : [])])),
                    priority,
                    deadline: null,
                    deadlineTime: deadlineTime || null,
                    owner: assignedUser || currentUserName,
                    createdBy: currentUserName,
                    createdAt: new Date().toISOString(),
                    assignedUsers: assignedUser ? [assignedUser] : [],
                    relatedLeadId: relatedLeadId || null,
                    relatedProjectId: relatedProjectId || null,
                    isLocking: relatedLeadId ? isLocking : false,
                    emailReminders,
                    requiresConclusion: offerConclusion && requiresConclusion ? true : undefined,
                    recurrence,
                });
            });
            requestClose(
                lines.length > 1
                    ? t(`${lines.length} recurring tasks created`, `${skTasks(lines.length)} opakované vytvorené`, `${lines.length} ismétlődő feladat létrehozva`)
                    : t("Recurring task created", "Opakovaná úloha vytvorená", "Ismétlődő feladat létrehozva"),
            );
            return;
        }

        const created: Task[] = lines.map((line, index) => ({
            id: `task-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            title: line,
            // The description hides once a second line appears; whatever was
            // typed before that still belongs to the first task.
            description: index === 0 ? description.trim() : "",
            tags: Array.from(new Set([...extractTagsFromText(line), ...(index === 0 ? extractTagsFromText(description) : [])])),
            status: taskStates[0] || "New",
            priority,
            deadline,
            deadlineTime: deadlineTime || undefined,
            owner: assignedUser,
            createdBy: currentUserName,
            assignedUsers: assignedUser ? [assignedUser] : [],
            relatedLeadId: relatedLeadId || undefined,
            relatedProjectId: relatedProjectId || undefined,
            isLocking: relatedLeadId ? isLocking : false,
            emailReminders,
            // Only while the setting offers it: a stale tick must not outlive the setting.
            requiresConclusion: offerConclusion && requiresConclusion ? true : undefined,
            ...(usedDictationRef.current ? { isAiGenerated: true } : {}),
        }));

        onCreate(created);
        const toast = created.length > 1 ? COPY_CREATED.many(t, created.length) : COPY_CREATED.one(t);

        if (closeAfterCreate) {
            requestClose(toast);
        } else {
            // Keep the composer open for the next task: clear the title and refocus.
            showComposerToast(toast, toastAnchor(true));
            setTitle("");
            setDescription("");
            setDictated(new Set());
            usedDictationRef.current = false;
            setRequiresConclusion(Boolean(defaultRequiresConclusion));
            focusRow(0, 0);
        }
    };

    if (!inline && typeof document === "undefined") return null;

    /* -------------------------------- render ------------------------------ */
    const subtitle = isRecording
        ? t("Listening… say what, when and for whom", "Počúvam… povedzte čo, kedy a pre koho", "Figyelek… mondja el, mit, mikor és kinek")
        : isProcessing
          ? t("Transcribing the dictation…", "Prepisujem diktát…", "A diktálás átírása…")
          : dictated.size > 0
            ? t("Check the fields filled from dictation", "Skontrolujte polia vyplnené z diktátu", "Ellenőrizze a diktálásból kitöltött mezőket")
            : manyTasks
              ? t("Each line is saved as a separate task", "Každý riadok sa uloží ako samostatná úloha", "Minden sor külön feladatként mentődik")
              : t("Type or dictate what needs to be done", "Napíšte alebo nadiktujte, čo treba urobiť", "Írja be vagy diktálja, mit kell tenni");
    const dictatedLabel = t("From dictation", "Z diktátu", "Diktálásból");
    const badge = (field: DictField) => (dictated.has(field) ? dictatedLabel : false);
    const isDictated = (field: DictField) => dictated.has(field);
    const rise = (delay: number) =>
        entering ? { className: "nt-rise", style: { animationDelay: `${delay}ms` } as React.CSSProperties } : { className: "", style: undefined };
    const scale = viewSizeScale();
    const BAR_HEIGHTS = [10, 18, 24, 14, 26, 20, 12, 22, 28, 16, 11, 24, 15, 26, 13, 19, 27, 12, 17, 22];
    const liveWords = dictation.liveText ? dictation.liveText.split(/\s+/) : [];
    const ctrlLabel = isMac ? "⌘ + Enter" : "Ctrl + Enter";

    const cardMotionClass = motion ? (closing ? "nt-shrink" : entering ? "nt-grow" : "") : "";
    const cardStyle: React.CSSProperties | undefined = motion
        ? ({ ["--nt-from" as string]: motion.from } as React.CSSProperties)
        : origin
          ? { opacity: 0 } // measured before paint; opacity (not visibility) keeps autofocus working
          : undefined;
    const showVeil = !!motion && origin?.kind !== "plain" && (entering || closing);
    const veilColor = origin?.kind === "mic" ? "bg-rose-600" : "bg-[#ff5d00]";

    const titleSection = (
        <div className={`flex flex-col gap-1.5 ${rise(200).className}`} style={rise(200).style}>
            <div className="flex items-center justify-between">
                <FieldLabel htmlFor={isMulti ? undefined : "nt-name"} badge={badge("title")}>
                    {manyTasks ? t("Task titles", "Názvy úloh", "Feladatok címei") : t("Task title", "Názov úlohy", "Feladat címe")}
                </FieldLabel>
                <span
                    className={`h-5.5 px-2.5 rounded-full text-micro font-semibold flex items-center ${
                        manyTasks ? "bg-[#fff1e8] dark:bg-orange-100 border border-orange-300 text-orange-700" : "bg-slate-100 text-slate-600"
                    }`}
                >
                    {countLabel(Math.max(1, lineCount), t)}
                </span>
            </div>

            {isMulti ? (
                <div
                    key={`rows-${fillKey}`}
                    className={`rounded-xl py-1.5 transition-[border-color,box-shadow] duration-150 ${
                        isDictated("title")
                            ? "border border-blue-200 bg-[#f8fbff] dark:bg-blue-50 nt-fill"
                            : "border-2 border-slate-200 bg-white focus-within:border-[#ff5d00] focus-within:shadow-[0_0_0_4px_rgba(255,93,0,0.12)]"
                    }`}
                >
                    {rows.map((line, i) => {
                        const tags = extractTagsFromText(line);
                        const plain = line.replace(/(^|\s)#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
                        const editing = focusedRow === i;
                        return (
                            <div key={i} className="flex items-center gap-3 px-3.5 py-1.75">
                                <span className="w-5.5 h-5.5 rounded-full bg-slate-100 text-slate-600 text-micro font-bold flex items-center justify-center shrink-0 tabular-nums">
                                    {i + 1}
                                </span>
                                {editing ? (
                                    <div className="flex-grow min-w-0">
                                        <TaskTagMentionInput
                                            value={line}
                                            onChange={(v) => {
                                                if (v.includes("\n")) {
                                                    const parts = v.split("\n");
                                                    const next = [...rows];
                                                    next.splice(i, 1, ...parts);
                                                    setRows(next);
                                                    focusRow(i + parts.length - 1, parts[parts.length - 1].length);
                                                    return;
                                                }
                                                const next = [...rows];
                                                next[i] = v;
                                                setRows(next);
                                            }}
                                            inputRef={(el) => {
                                                rowRefs.current[i] = el;
                                            }}
                                            onFocus={() => setFocusedRow(i)}
                                            onBlur={() => setFocusedRow((cur) => (cur === i ? null : cur))}
                                            onKeyDown={onRowKeyDown(i)}
                                            ariaLabel={t(`Task ${i + 1}`, `Úloha ${i + 1}`, `${i + 1}. feladat`)}
                                            existingTags={existingTags}
                                            mentionEntities={mentionEntities}
                                            onAssignEntity={onAssignEntity}
                                            placeholder={t("Next task…", "Ďalšia úloha…", "Következő feladat…")}
                                            className="w-full p-0 border-0 bg-transparent outline-none text-body font-semibold text-slate-900 placeholder:text-slate-400"
                                        />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            focusRow(i, line.length);
                                        }}
                                        onFocus={() => focusRow(i, line.length)}
                                        className="flex-grow min-w-0 text-left text-body font-semibold text-slate-900 truncate cursor-text"
                                    >
                                        {plain || (
                                            <span className="text-slate-400 font-normal">{t("Next task…", "Ďalšia úloha…", "Következő feladat…")}</span>
                                        )}
                                    </button>
                                )}
                                {!editing &&
                                    tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="h-5.5 px-2 rounded-full bg-slate-100 text-slate-600 text-micro font-semibold flex items-center shrink-0"
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <TaskTagMentionInput
                    key={`title-${fillKey}`}
                    id="nt-name"
                    multiline
                    rows={1}
                    autoFocus={!startDictation}
                    required
                    value={title}
                    onChange={(v) => {
                        setTitle(v);
                        clearDictated("title");
                        if (v.includes("\n")) {
                            const parts = v.split("\n");
                            focusRow(parts.length - 1, parts[parts.length - 1].length);
                        }
                    }}
                    inputRef={(el) => {
                        singleRef.current = el;
                    }}
                    onKeyDown={onSingleKeyDown}
                    existingTags={existingTags}
                    mentionEntities={mentionEntities}
                    onAssignEntity={onAssignEntity}
                    placeholder={t("What needs to be done?", "Čo treba urobiť?", "Mit kell tenni?")}
                    className={`box-border w-full min-h-12 rounded-xl text-body font-semibold text-slate-900 resize-y outline-none leading-[1.4] placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 ${
                        isDictated("title")
                            ? "px-3.75 py-3.25 border border-blue-200 bg-[#f8fbff] dark:bg-blue-50 nt-fill"
                            : "px-3.5 py-3 border-2 border-slate-200 bg-white focus:border-[#ff5d00] focus:shadow-[0_0_0_4px_rgba(255,93,0,0.12)]"
                    }`}
                />
            )}

            {manyTasks ? (
                <p className="m-0 text-micro text-slate-500">
                    {t(
                        `The description is hidden for several tasks. Deadline, priority, assignment and the options below apply to all ${lineCount}.`,
                        `Popis sa pri viacerých úlohách skryje. Termín, priorita, priradenie a možnosti nižšie platia pre všetky ${lineCount}.`,
                        `Több feladatnál a leírás rejtve marad. A határidő, a prioritás, a hozzárendelés és az alábbi beállítások mind a(z) ${lineCount} feladatra érvényesek.`,
                    )}
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-micro text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <Kbd>Shift + Enter</Kbd>
                        {t("next task", "ďalšia úloha", "következő feladat")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Kbd>#</Kbd>
                        {t("tag", "tag", "címke")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Kbd>@</Kbd>
                        {t("mention", "zmienka", "említés")}
                    </span>
                </div>
            )}
        </div>
    );

    const descriptionSection = !isMulti && (
        <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="nt-desc" badge={badge("description")}>
                {t("Description", "Popis", "Leírás")} <span className="font-normal text-slate-500">({t("optional", "voliteľné", "opcionális")})</span>
            </FieldLabel>
            <TaskTagMentionInput
                key={`desc-${fillKey}`}
                id="nt-desc"
                multiline
                rows={2}
                value={description}
                onChange={(v) => {
                    setDescription(v);
                    clearDictated("description");
                }}
                existingTags={existingTags}
                mentionEntities={mentionEntities}
                placeholder={t("Details, links, context…", "Podrobnosti, odkazy, kontext…", "Részletek, hivatkozások, háttér…")}
                className={`box-border w-full min-h-16 px-3.5 py-2.5 rounded-xl text-ui text-slate-800 resize-y outline-none leading-normal placeholder:text-slate-400 transition-colors duration-150 ${
                    isDictated("description") ? "border border-blue-200 bg-[#f8fbff] dark:bg-blue-50 nt-fill" : "border border-slate-200 bg-white focus:border-[#ff5d00]"
                }`}
            />
        </div>
    );

    const whenSection = (
        <div className={`flex flex-col gap-3 ${rise(240).className}`} style={rise(240).style}>
            <Overline>{t("When", "Kedy", "Mikor")}</Overline>
            <div className={`grid grid-cols-1 gap-3 ${repeat ? "@md:grid-cols-2" : "@md:grid-cols-3"}`}>
                {/* Deadline — a repeating task takes its dates from the rule under Options */}
                {!repeat && (
                <div className="relative flex flex-col gap-1.5">
                    <FieldLabel htmlFor="nt-deadline-btn" badge={badge("deadline")}>
                        {t("Deadline", "Termín", "Határidő")}
                    </FieldLabel>
                    <button
                        key={`deadline-${fillKey}`}
                        id="nt-deadline-btn"
                        type="button"
                        onClick={openDatePicker}
                        style={isDictated("deadline") ? { animationDelay: "120ms" } : undefined}
                        className={`${FIELD_BOX} ${fieldSkin(isDictated("deadline"))}`}
                    >
                        <Calendar aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="flex-grow truncate">{formatDeadline(deadline, systemLanguage)}</span>
                    </button>
                    <input
                        ref={dateInputRef}
                        type="date"
                        required
                        tabIndex={-1}
                        aria-label={t("Deadline", "Termín", "Határidő")}
                        value={deadline}
                        onChange={(e) => changeDeadline(e.target.value)}
                        className="absolute left-0 bottom-0 w-full h-10 opacity-0 pointer-events-none"
                    />
                </div>
                )}

                {/* Time */}
                <div className="flex flex-col gap-1.5">
                    <FieldLabel badge={badge("time")}>{t("Time", "Čas", "Időpont")}</FieldLabel>
                    {customTime ? (
                        <div
                            key={`time-${fillKey}`}
                            style={isDictated("time") ? { animationDelay: "200ms" } : undefined}
                            className={`${FIELD_BOX} cursor-default focus-within:border-[#ff5d00] ${fieldSkin(isDictated("time"))}`}
                        >
                            <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                            <input
                                type="time"
                                value={deadlineTime}
                                aria-label={t("Time", "Čas", "Időpont")}
                                onChange={(e) => {
                                    setDeadlineTime(e.target.value);
                                    clearDictated("time");
                                }}
                                className="flex-grow min-w-0 bg-transparent outline-none text-ui text-slate-800"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomTime(false);
                                    if (!TIME_PRESETS.includes(deadlineTime)) setDeadlineTime("16:00");
                                }}
                                aria-label={t("Preset times", "Predvolené časy", "Előre beállított időpontok")}
                                title={t("Preset times", "Predvolené časy", "Előre beállított időpontok")}
                                className="shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <CustomSelect
                            key={`time-${fillKey}`}
                            unstyled
                            value={deadlineTime}
                            onChange={(v) => {
                                clearDictated("time");
                                if (v === "custom") {
                                    setCustomTime(true);
                                    if (!deadlineTime) setDeadlineTime("12:00");
                                } else {
                                    setDeadlineTime(v);
                                }
                            }}
                            icon={<Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />}
                            options={timeOptions}
                            style={isDictated("time") ? { animationDelay: "200ms" } : undefined}
                            className={selectSkin(isDictated("time"))}
                        />
                    )}
                </div>

                {/* Priority */}
                <div ref={prioRef} className="relative flex flex-col gap-1.5">
                    <FieldLabel id="nt-prio-l" badge={badge("priority")}>
                        {t("Priority", "Priorita", "Prioritás")}
                    </FieldLabel>
                    <button
                        key={`prio-${fillKey}`}
                        ref={prioButtonRef}
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={prioOpen}
                        aria-labelledby="nt-prio-l"
                        onClick={() => setPrioOpen((o) => !o)}
                        onKeyDown={onPrioKeyDown}
                        style={isDictated("priority") && !prioOpen ? { animationDelay: "240ms" } : undefined}
                        className={`${FIELD_BOX} gap-2.5 ${
                            prioOpen
                                ? "border border-[#ff5d00] bg-white shadow-[0_0_0_3px_rgba(255,93,0,0.12)]"
                                : fieldSkin(isDictated("priority"))
                        }`}
                    >
                        <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-[180ms] ${PRIORITY_DOT[priority]}`} />
                        <span className="flex-grow truncate">{taskPriorityLabel(priority, t)}</span>
                        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                    {prioOpen && prioBox && typeof document !== "undefined" && createPortal(
                        <div
                            ref={prioMenuRef}
                            role="listbox"
                            aria-labelledby="nt-prio-l"
                            style={{ left: prioBox.left, top: prioBox.top, width: prioBox.width }}
                            className="nt-menu fixed z-[100001] p-1 bg-white border border-slate-200 rounded-2xl shadow-[0_10px_25px_-8px_rgba(15,23,42,0.18)] flex flex-col gap-0.5"
                        >
                            {PRIORITIES.map((p, i) => {
                                const on = priority === p;
                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        role="option"
                                        aria-selected={on}
                                        onClick={() => pickPriority(p)}
                                        onMouseEnter={() => setPrioActive(i)}
                                        className={`h-9 px-2.5 border-0 rounded-xl text-ui text-slate-800 flex items-center gap-2.5 transition-colors duration-150 cursor-pointer ${
                                            on ? "bg-slate-50 font-semibold" : prioActive === i ? "bg-slate-50/70 font-normal" : "bg-transparent font-normal"
                                        }`}
                                    >
                                        <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[p]}`} />
                                        <span className="flex-grow text-left">{taskPriorityLabel(p, t)}</span>
                                        {on && <Check aria-hidden="true" className="h-4 w-4 text-orange-700" strokeWidth={2.5} />}
                                    </button>
                                );
                            })}
                        </div>,
                        document.body,
                    )}
                </div>
            </div>
            {repeat ? (
                <p className="m-0 text-micro text-slate-500">
                    {t(
                        "The dates come from the repeat rule under Options.",
                        "Termíny určuje opakovanie v časti Možnosti.",
                        "A határidőket a Beállítások alatti ismétlési szabály adja.",
                    )}
                </p>
            ) : (
            <div className="flex flex-wrap gap-2">
                {quickDates.map((d) => {
                    const on = deadline === d.date;
                    return (
                        <button
                            key={d.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => changeDeadline(d.date)}
                            className={`h-8 px-3.5 rounded-full text-caption font-semibold border transition-colors duration-150 cursor-pointer ${
                                on
                                    ? "bg-[#fff1e8] dark:bg-orange-100 border-orange-300 text-orange-700"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                        >
                            {d.label}
                        </button>
                    );
                })}
            </div>
            )}
        </div>
    );

    const anyDictatedContext = isDictated("deadline") || isDictated("time") || isDictated("priority") || isDictated("lead") || isDictated("assignee");
    const whoSection = (
        <div className={`flex flex-col gap-3 ${rise(280).className}`} style={rise(280).style}>
            <Overline>{t("Who and what for", "Kto a k čomu", "Ki és mihez")}</Overline>
            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                    <FieldLabel badge={badge("assignee")}>{t("Assignee", "Riešiteľ", "Felelős")}</FieldLabel>
                    <CustomSelect
                        key={`assignee-${fillKey}`}
                        unstyled
                        value={assignedUser}
                        onChange={(v) => {
                            setAssignedUser(v);
                            clearDictated("assignee");
                        }}
                        options={assigneeOptions}
                        className={selectSkin(isDictated("assignee"), "pl-1.5 pr-2.5")}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <FieldLabel badge={badge("lead")}>{t("Lead / client", "Lead / klient", "Lead / ügyfél")}</FieldLabel>
                    <ClientSelect
                        key={`lead-${fillKey}`}
                        unstyled
                        leads={leads}
                        excludeIds={staleLeadIdsForTasks(leads, projects, leadStageGroups, leadStateParents, relatedLeadId)}
                        value={relatedLeadId}
                        onChange={(v) => {
                            setRelatedLeadId(v);
                            clearDictated("lead");
                            if (!v) setIsLocking(false);
                        }}
                        showCity={false}
                        showKind
                        addKind="lead"
                        placeholder={t("Search…", "Vyhľadať…", "Keresés…")}
                        noneLabel={relatedLeadId ? t("None", "Žiadny", "Nincs") : undefined}
                        icon={
                            selectedLead ? (
                                <span className="w-5.5 h-5.5 rounded-full bg-slate-100 text-slate-600 text-micro font-bold flex items-center justify-center shrink-0">
                                    {(selectedLead.name || "?").trim().charAt(0).toUpperCase()}
                                </span>
                            ) : (
                                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                            )
                        }
                        className={selectSkin(isDictated("lead"), selectedLead ? "" : "[&_span]:!text-slate-500 [&_span]:!font-normal")}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <FieldLabel>{t("Project", "Projekt", "Projekt")}</FieldLabel>
                    <CustomSelect
                        unstyled
                        searchable
                        value={relatedProjectId}
                        onChange={setRelatedProjectId}
                        icon={<Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />}
                        options={projectOptions}
                        className={selectSkin(false, relatedProjectId ? "" : "text-slate-500")}
                    />
                </div>
            </div>
            {anyDictatedContext && (
                <div role="note" className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-900 text-micro leading-[1.4]">
                    <span className="h-5.5 px-2 rounded-full bg-blue-100 text-blue-700 text-micro font-semibold flex items-center gap-1 shrink-0">
                        <Mic aria-hidden="true" className="h-3 w-3" strokeWidth={2.5} />
                        {dictatedLabel}
                    </span>
                    <span>
                        {t(
                            "Fields with this mark were filled by dictation. Check them before saving.",
                            "Polia s touto značkou vyplnil diktát. Skontrolujte ich pred uložením.",
                            "Az ilyen jelölésű mezőket a diktálás töltötte ki. Mentés előtt ellenőrizze őket.",
                        )}
                    </span>
                </div>
            )}
        </div>
    );

    const optionsSection = (
        <div className={`flex flex-col gap-3 ${rise(320).className}`} style={rise(320).style}>
            <Overline>{t("Options", "Možnosti", "Beállítások")}</Overline>
            <div className="rounded-2xl bg-slate-50 flex flex-col">
                {canRepeat && (
                    <>
                        <OptionRow
                            icon={<Repeat aria-hidden="true" className="h-4 w-4" />}
                            title={t("Repeat", "Opakovanie", "Ismétlés")}
                            hint={repeatHint}
                            on={repeat}
                            onToggle={toggleRepeat}
                            testId="task-repeat"
                            switchTestId="task-repeat-toggle"
                        >
                            <div className="pl-11">
                                <TaskRecurrenceFields recurrence={recurrence} onChange={setRecurrence} t={t} />
                            </div>
                        </OptionRow>
                        <OptionDivider />
                    </>
                )}

                {offerConclusion && (
                    <>
                        <OptionRow
                            icon={<ClipboardCheck aria-hidden="true" className="h-4 w-4" />}
                            title={t("Requires conclusion", "Vyžaduje záver", "Összegzés szükséges")}
                            hint={
                                requiresConclusion
                                    ? t(
                                          "A result must be written when it is completed",
                                          "Pri dokončení treba zapísať výsledok",
                                          "Befejezéskor meg kell írni az eredményt",
                                      )
                                    : t("Not needed", "Nie je potrebný", "Nem szükséges")
                            }
                            on={requiresConclusion}
                            onToggle={() => setRequiresConclusion((v) => !v)}
                            testId="task-conclusion-option"
                            switchTestId="task-requires-conclusion"
                        />
                        <OptionDivider />
                    </>
                )}

                <OptionRow
                    icon={<Mail aria-hidden="true" className="h-4 w-4" />}
                    title={t("Remind by e-mail", "Pripomenúť e-mailom", "Emlékeztetés e-mailben")}
                    hint={
                        mine
                            ? reminderInfo?.tone === "warn"
                                ? reminderInfo.text
                                : `${reminderTiming(mine, t)} · ${t("to my e-mail", "na môj e-mail", "az e-mailemre")}`
                            : t("Off", "Vypnuté", "Kikapcsolva")
                    }
                    hintWarn={!!mine && reminderInfo?.tone === "warn"}
                    on={!!mine}
                    onToggle={() => setReminder(mine ? null : "morning")}
                    disabled={!currentUserName}
                    testId="task-email-reminder"
                    switchTestId="task-email-reminder-toggle"
                >
                    {mine && (
                        <div className="pl-11 flex flex-col gap-1.5">
                            <div className="grid grid-cols-2 gap-2">
                                <CustomSelect
                                    unstyled
                                    value={mine}
                                    onChange={(v) => setReminder(v as TaskEmailReminder)}
                                    options={TASK_EMAIL_REMINDERS.map((w) => ({ value: w, label: reminderTiming(w, t) }))}
                                    className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-ui text-slate-800 justify-between hover:border-slate-300"
                                />
                            </div>
                            {reminderInfo && reminderInfo.tone !== "warn" && (
                                <p data-testid="task-email-reminder-hint" className="m-0 text-micro text-slate-500">
                                    {reminderInfo.text}
                                </p>
                            )}
                        </div>
                    )}
                </OptionRow>

                {relatedLeadId && (
                    <>
                        <OptionDivider />
                        <OptionRow
                            icon={<Lock aria-hidden="true" className="h-4 w-4" />}
                            title={t("Block pipeline stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                            hint={
                                isLocking
                                    ? t(
                                          "The lead cannot move on until this task is done",
                                          "Lead sa nepresunie ďalej, kým úloha nie je hotová",
                                          "A lead nem léphet tovább, amíg a feladat el nem készül",
                                      )
                                    : t("The lead can move freely", "Lead sa môže presúvať voľne", "A lead szabadon mozoghat")
                            }
                            on={isLocking}
                            onToggle={() => setIsLocking((v) => !v)}
                            testId="task-lock-option"
                        />
                    </>
                )}
            </div>
        </div>
    );

    const summarySection = (
        <div className={`flex flex-col gap-3 ${rise(280).className}`} style={rise(280).style}>
            <Overline>
                {t("Who and what for", "Kto a k čomu", "Ki és mihez")} · {t("Options", "Možnosti", "Beállítások")}
            </Overline>
            <div className="rounded-2xl bg-slate-50 px-3.5 py-3 flex flex-wrap items-center gap-2">
                <span className="h-7.5 pl-1 pr-2.5 rounded-full bg-white border border-slate-200 text-caption font-semibold text-slate-800 flex items-center gap-1.5">
                    {avatar(assignedUser, true)}
                    {assignedUser ? personLabel(assignedUser) : t("Unassigned", "Nepriradený", "Kijelöletlen")}
                </span>
                {selectedLead && <SummaryChip>{selectedLead.name}</SummaryChip>}
                {selectedProject && (
                    <SummaryChip>
                        {t("Project", "Projekt", "Projekt")}: {projectLabel(selectedProject)}
                    </SummaryChip>
                )}
                {repeat && <SummaryChip>{describeRecurrence(recurrence, recLang)}</SummaryChip>}
                {offerConclusion && requiresConclusion && <SummaryChip>{t("Requires conclusion", "Vyžaduje záver", "Összegzés szükséges")}</SummaryChip>}
                {mine && <SummaryChip>{reminderChip(mine, t)}</SummaryChip>}
                {relatedLeadId && isLocking && <SummaryChip>{t("Blocks the stage", "Blokuje fázu", "Zárolja a szakaszt")}</SummaryChip>}
                <button
                    type="button"
                    onClick={() => setSummaryExpanded(true)}
                    className="ml-auto h-7.5 px-2.5 border-0 rounded-xl bg-transparent text-orange-700 text-caption font-semibold hover:bg-orange-50 cursor-pointer"
                >
                    {t("Edit", "Upraviť", "Szerkesztés")}
                </button>
            </div>
        </div>
    );

    const createLabel = repeat
        ? manyTasks
            ? t(`Create ${lineCount} recurring tasks`, `Vytvoriť ${skTasks(lineCount)} s opakovaním`, `${lineCount} ismétlődő feladat létrehozása`)
            : t("Create recurring task", "Vytvoriť opakovanú úlohu", "Ismétlődő feladat létrehozása")
        : manyTasks
        ? t(`Create ${lineCount} tasks`, `Vytvoriť ${skTasks(lineCount)}`, `${lineCount} feladat létrehozása`)
        : t("Create task", "Vytvoriť úlohu", "Feladat létrehozása");

    const panel = (
        <section
            ref={cardRef as React.RefObject<HTMLElement>}
            aria-labelledby="nt-title"
            {...(inline ? {} : { role: "dialog", "aria-modal": false })}
            onAnimationEnd={(e) => {
                if (e.target === e.currentTarget && e.animationName === "nt-grow") setEntering(false);
            }}
            style={cardStyle}
            className={`@container bg-white border border-slate-200/80 rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col ${cardMotionClass || (origin ? "" : "nt-rise")} ${
                inline
                    ? "relative w-full"
                    : "fixed top-22.5 right-2 sm:right-4 md:right-6 z-[100000] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-160 max-h-[calc(100vh-6.5rem)]"
            }`}
        >
            <form
                data-quick-task-form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    createTasks(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        createTasks(true);
                    }
                }}
                className="flex flex-col min-h-0"
            >
                {/* Header: same row as the closed bar — create on the left, mic on the right */}
                <header className="flex items-center gap-3 py-4 pr-4 pl-6 border-b border-slate-100 shrink-0">
                    <span className="w-9 h-9 rounded-xl bg-[#fff1e8] dark:bg-orange-100 text-[#ff5d00] flex items-center justify-center shrink-0">
                        <Plus aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={2.25} />
                    </span>
                    <div className="flex-grow min-w-0">
                        <h2 id="nt-title" className="m-0 text-title-sm font-bold text-slate-900 leading-[1.3]">
                            {manyTasks ? t("New tasks", "Nové úlohy", "Új feladatok") : t("New task", "Nová úloha", "Új feladat")}
                        </h2>
                        <p className="mt-0.5 mb-0 text-caption text-slate-500 truncate">{subtitle}</p>
                    </div>
                    <button
                        type="button"
                        data-testid="voice-record-button"
                        aria-pressed={isRecording}
                        disabled={isProcessing}
                        onClick={() => (isRecording ? void dictation.stop() : void dictation.start())}
                        className={`nt-press relative h-10 px-3.5 border-0 rounded-xl text-white text-ui font-semibold flex items-center gap-2 shrink-0 cursor-pointer disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 ${
                            isRecording || isProcessing
                                ? "bg-rose-700 shadow-none"
                                : "bg-rose-600 hover:bg-rose-700 shadow-[0_4px_6px_-1px_rgba(225,29,72,0.25)]"
                        }`}
                    >
                        {isRecording ? (
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="h-3.5 w-3.5">
                                <rect width="16" height="16" x="4" y="4" rx="3" />
                            </svg>
                        ) : isProcessing ? (
                            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                            <Mic aria-hidden="true" className="h-4 w-4" />
                        )}
                        <span className="hidden @sm:inline">
                            {isRecording ? t("Stop", "Zastaviť", "Leállítás") : isProcessing ? t("Transcribing", "Prepisujem", "Átírás") : t("Dictate", "Diktovať", "Diktálás")}
                        </span>
                        {isRecording && (
                            <span className="tabular-nums font-medium opacity-90">
                                {Math.floor(dictation.seconds / 60)}:{String(dictation.seconds % 60).padStart(2, "0")}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => requestClose()}
                        aria-label={t("Close", "Zavrieť", "Bezárás")}
                        className="nt-press w-10 h-10 border-0 rounded-xl bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                        <X aria-hidden="true" className="h-4.5 w-4.5" />
                    </button>
                </header>

                {/* Live listening strip */}
                {showStrip && (
                    <div
                        className={`${stripLeaving ? "nt-strip-out" : "nt-strip"} px-6 py-3.5 bg-rose-50 border-b border-rose-100 flex items-center gap-3.5 shrink-0`}
                    >
                        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0 ${isRecording ? "nt-dot" : ""}`} />
                        <div aria-hidden="true" className="flex items-center gap-0.75 h-7 shrink-0">
                            {Array.from({ length: DICTATION_BARS }, (_, i) => (
                                <span
                                    key={i}
                                    className={`block w-0.75 rounded-full bg-rose-600 transition-[height] duration-75 ${isRecording ? "" : "nt-wave-stop"}`}
                                    style={{ height: `${Math.max(3, BAR_HEIGHTS[i] * (dictation.levels[i] ?? 0.3)) * scale}px` }}
                                />
                            ))}
                        </div>
                        <p aria-live="polite" className="m-0 flex-grow min-w-0 min-h-4.5 text-caption text-rose-800 leading-[1.4]">
                            {isRecording
                                ? liveWords.map((w, i) => (
                                      <span key={i} className="nt-word">
                                          {w}{" "}
                                      </span>
                                  ))
                                : t("Transcribing…", "Prepisujem…", "Átírás…")}
                        </p>
                    </div>
                )}

                <div className={`p-6 flex flex-col gap-7 min-h-0 ${inline ? "" : "overflow-y-auto"}`}>
                    {/* 1 · WHAT */}
                    <div className="flex flex-col gap-3">
                        {titleSection}
                        {descriptionSection}
                    </div>
                    {/* 2 · WHEN */}
                    {whenSection}
                    {/* 3 · WHO & CONTEXT, 4 · OPTIONS — one summary row while several tasks share them */}
                    {collapsed ? (
                        summarySection
                    ) : (
                        <>
                            {whoSection}
                            {optionsSection}
                        </>
                    )}
                </div>

                <footer
                    className={`py-3.5 pr-4 pl-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2 shrink-0 ${rise(360).className}`}
                    style={rise(360).style}
                >
                    <span className="hidden @md:flex flex-grow text-micro text-slate-500 items-center gap-1.5">
                        <Kbd white>{ctrlLabel}</Kbd>
                        {manyTasks ? t("creates all", "vytvorí všetky", "mindet létrehozza") : t("creates", "vytvorí", "létrehozza")}
                    </span>
                    <button
                        type="button"
                        onClick={() => requestClose()}
                        className="nt-press h-10 px-3.5 border-0 rounded-xl bg-transparent text-slate-600 text-ui font-semibold hover:bg-slate-100 cursor-pointer"
                    >
                        {t("Cancel", "Zrušiť", "Mégse")}
                    </button>
                    {!manyTasks && !repeat && (
                        <button
                            type="button"
                            onClick={() => createTasks(false)}
                            className="nt-press h-10 px-3.5 border border-slate-200 rounded-xl bg-white text-slate-800 text-ui font-semibold shadow-xs hover:border-slate-300 cursor-pointer"
                        >
                            {t("Create & next", "Vytvoriť a ďalšia", "Létrehozás és következő")}
                        </button>
                    )}
                    <button
                        type="submit"
                        className="nt-press h-10 px-4.5 border-0 rounded-xl bg-[#ff5d00] hover:bg-[#e05200] text-white text-ui font-bold flex items-center gap-2 shadow-[0_4px_6px_-1px_rgba(255,93,0,0.25)] cursor-pointer"
                    >
                        <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                        {createLabel}
                    </button>
                </footer>
            </form>

            {/* Veil: the clicked button's colour and label, dissolving as the card grows (and returning as it shrinks) */}
            {showVeil && motion && (
                <div
                    aria-hidden="true"
                    className={`${closing ? "nt-veil-in" : "nt-veil-out"} absolute inset-0 z-10 pointer-events-none overflow-hidden ${veilColor}`}
                >
                    <span
                        className="nt-ripple absolute w-4 h-4 -mt-2 -ml-2 rounded-full bg-white"
                        style={{ left: `${motion.cx}px`, top: `${motion.cy}px` }}
                    />
                    <span
                        className={`nt-label absolute text-white text-body flex items-center justify-center ${
                            origin?.kind === "mic" ? "font-semibold gap-2" : "font-bold gap-2.5"
                        }`}
                        style={{ left: motion.box.left, top: motion.box.top, width: motion.box.width, height: motion.box.height }}
                    >
                        {origin?.kind === "mic" ? (
                            <>
                                <Mic className="h-4.5 w-4.5" />
                                {t("Dictate", "Diktovať", "Diktálás")}
                            </>
                        ) : (
                            <>
                                <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
                                {t("Create New Task", "Vytvoriť novú úlohu", "Új feladat")}
                            </>
                        )}
                    </span>
                </div>
            )}
        </section>
    );

    if (inline) return panel;

    return createPortal(
        <>
            {/* Transparent catcher below the header: a click outside closes the card, the header stays usable. */}
            <div onClick={() => requestClose()} className="fixed inset-x-0 bottom-0 top-20 z-[100000]" aria-hidden="true" />
            {panel}
        </>,
        document.body,
    );
};

const SummaryChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="h-7.5 px-2.5 rounded-full bg-white border border-slate-200 text-caption font-semibold text-slate-800 flex items-center max-w-full truncate">
        {children}
    </span>
);
