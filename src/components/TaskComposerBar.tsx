import React, { useEffect, useRef, useState } from "react";
import { Mic, Plus } from "lucide-react";
import type { Language } from "../utils/translations";
import { composerOriginFrom, type ComposerOrigin } from "./QuickTaskModal";

/** "granted" | "denied" | "prompt" | "unknown" — never throws (Safari lacks the query). */
const microphonePermission = async (): Promise<"granted" | "denied" | "prompt" | "unknown"> => {
    try {
        const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        return status ? status.state : "unknown";
    } catch {
        return "unknown";
    }
};

interface TaskComposerBarProps {
    systemLanguage: Language;
    canCreate?: boolean;
    /** Opens the composer for typing; the card grows out of the button. */
    onCreate: (origin?: ComposerOrigin) => void;
    /** Opens the composer and starts dictating at once; the card grows out of the mic. */
    onDictate: (origin?: ComposerOrigin) => void;
    /**
     * Deep link `#tasks?voice=1`. A new non-zero value asks the bar to get ready:
     * it opens the composer dictating when the microphone is already allowed, and
     * otherwise highlights the mic and waits for the click, because browsers only
     * show the microphone prompt for a user gesture.
     */
    armRequest?: number;
    onArmHandled?: () => void;
    /** The composer was just closed: the mic fades back in (motion board). */
    returned?: boolean;
}

/**
 * The closed state of the new-task composer ("Closed · same bar, same mic"):
 * create on the left, dictate on the right — the same row the open card's
 * header keeps.
 */
export const TaskComposerBar: React.FC<TaskComposerBarProps> = ({
    systemLanguage,
    canCreate = true,
    onCreate,
    onDictate,
    armRequest = 0,
    onArmHandled,
    returned = false,
}) => {
    const t = (en: string, sk: string, hu: string) => (systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en);
    const micRef = useRef<HTMLButtonElement | null>(null);
    const armHandledRef = useRef<number | null>(null);
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armRequest) {
            armHandledRef.current = null; // the parent consumed it; the next request is new again
            return;
        }
        if (armHandledRef.current === armRequest) return;
        armHandledRef.current = armRequest;
        onArmHandled?.();
        if (!canCreate) return;
        setArmed(true);
        requestAnimationFrame(() => {
            micRef.current?.focus();
            micRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        });
        void microphonePermission().then((state) => {
            if (state === "granted") {
                setArmed(false);
                onDictate(composerOriginFrom(null, "mic", micRef.current));
            }
        });
        const timer = window.setTimeout(() => setArmed(false), 20000);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [armRequest]);

    return (
        <div className="w-full flex flex-col gap-1.5">
            <div className="w-full flex items-center gap-3">
                <button
                    type="button"
                    disabled={!canCreate}
                    onClick={(e) => onCreate(composerOriginFrom(e, "create"))}
                    title={t("Create New Task", "Vytvoriť novú úlohu", "Új feladat")}
                    className="nt-press flex-grow min-w-0 h-13 border-0 rounded-2xl bg-[#ff5d00] hover:bg-[#e05200] text-white text-body font-bold flex items-center justify-center gap-2.5 shadow-[0_4px_6px_-1px_rgba(255,93,0,0.25)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5d00]"
                >
                    <Plus aria-hidden="true" className="h-4.5 w-4.5 shrink-0" strokeWidth={2.25} />
                    <span className="truncate">{t("Create New Task", "Vytvoriť novú úlohu", "Új feladat")}</span>
                </button>
                <button
                    type="button"
                    ref={micRef}
                    data-testid="voice-record-button"
                    data-armed={armed ? "true" : undefined}
                    disabled={!canCreate}
                    onClick={(e) => {
                        setArmed(false);
                        onDictate(composerOriginFrom(e, "mic"));
                    }}
                    title={t("Dictate a task", "Nadiktovať úlohu", "Feladat diktálása")}
                    className={`nt-press w-33 shrink-0 h-13 p-0 border-0 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-body font-semibold flex items-center justify-center gap-2 shadow-[0_4px_6px_-1px_rgba(225,29,72,0.25)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-4 focus-visible:ring-rose-300/70 ${
                        returned ? "nt-fade-in" : ""
                    } ${armed ? "ring-4 ring-rose-300/70 animate-pulse" : ""}`}
                >
                    <Mic aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
                    <span>{t("Dictate", "Diktovať", "Diktálás")}</span>
                </button>
            </div>
            {armed && (
                <p
                    role="status"
                    data-testid="voice-armed-hint"
                    className="m-0 text-caption font-semibold text-rose-600 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                    {t(
                        "Ready — press the microphone to start dictating.",
                        "Pripravené — stlačte mikrofón a začnite diktovať.",
                        "Kész — nyomja meg a mikrofont a diktálás indításához.",
                    )}
                </p>
            )}
        </div>
    );
};
