import React from "react";
import { Mail } from "lucide-react";
import type { Task, TaskEmailReminder, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import type { Translate } from "../utils/taskLabels";
import { TASK_EMAIL_REMINDERS, taskDueAt, taskReminderSendAt, withTaskReminder } from "../utils/taskReminders";

interface TaskEmailReminderFieldProps {
    /** The task as it stands in the form, for its deadline and reminder map. */
    task: Pick<Task, "deadline" | "deadlineTime" | "emailReminders">;
    onChange: (reminders: Task["emailReminders"]) => void;
    /** The signed-in user — "me" in "Notify me". */
    currentUserName: string;
    users: UserProfile[];
    systemLanguage: Language;
    t: Translate;
    disabled?: boolean;
    /**
     * False when Settings → Email Server has no outgoing mail server, so the
     * server would skip the reminder. Left out, the field does not warn.
     */
    mailConfigured?: boolean;
}

const LOCALES: Record<string, string> = { sk: "sk-SK", hu: "hu-HU", en: "en-GB" };

/**
 * "Notify me about the task by e-mail" — one checkbox per signed-in user, plus
 * when to send. Each user's choice is their own: ticking it here never turns a
 * colleague's reminder on or off. The server does the sending.
 */
export const TaskEmailReminderField: React.FC<TaskEmailReminderFieldProps> = ({
    task,
    onChange,
    currentUserName,
    users,
    systemLanguage,
    t,
    disabled = false,
    mailConfigured = true,
}) => {
    const reminders = task.emailReminders || {};
    const mine = currentUserName ? reminders[currentUserName] : undefined;
    const others = Object.keys(reminders).filter((name) => name !== currentUserName);
    const myEmail = users.find((u) => u.name === currentUserName)?.email || "";

    const set = (when: TaskEmailReminder | null) => onChange(withTaskReminder(task.emailReminders, currentUserName, when));

    const optionLabel = (when: TaskEmailReminder) => {
        switch (when) {
            case "morning":
                return t("In the morning", "Ráno v ten deň", "Aznap reggel");
            case "1h":
                return t("1 hour before", "1 hodinu pred", "1 órával előtte");
            case "1d":
                return t("1 day before", "1 deň pred", "1 nappal előtte");
        }
    };

    // Says exactly when the mail will arrive, so nobody has to guess what
    // "in the morning" means or wonder why a past-due task never mailed them.
    const hint = (() => {
        if (!mine) return null;
        if (!myEmail) {
            return {
                tone: "warn" as const,
                text: t(
                    "Your profile has no e-mail address, so nothing can be sent.",
                    "Váš profil nemá e-mailovú adresu, preto nie je kam poslať upozornenie.",
                    "A profiljában nincs e-mail-cím, így nem lehet értesítést küldeni.",
                ),
            };
        }
        if (!mailConfigured) {
            return {
                tone: "warn" as const,
                text: t(
                    "No outgoing mail server is set up (Settings → Email Server), so nothing can be sent yet.",
                    "Nie je nastavený server odchádzajúcej pošty (Nastavenia → E-mailový server), preto sa zatiaľ nič neodošle.",
                    "Nincs beállítva kimenő levelezőszerver (Beállítások → E-mail szerver), ezért egyelőre semmi sem küldhető.",
                ),
            };
        }
        const sendAt = taskReminderSendAt(task, mine);
        if (!sendAt) return null;
        const due = taskDueAt(task);
        const now = new Date();
        if (due && now >= due) {
            return {
                tone: "warn" as const,
                text: t(
                    "The deadline has already passed — no reminder will be sent.",
                    "Termín už uplynul — upozornenie sa neodošle.",
                    "A határidő már lejárt — nem küldünk emlékeztetőt.",
                ),
            };
        }
        if (now >= sendAt) {
            return {
                tone: "info" as const,
                text: t(
                    `The reminder time has passed, so it goes out right away to ${myEmail}.`,
                    `Čas upozornenia už prešiel, odošle sa hneď na ${myEmail}.`,
                    `Az emlékeztető ideje már elmúlt, azonnal elküldjük ide: ${myEmail}.`,
                ),
            };
        }
        const locale = LOCALES[systemLanguage] || LOCALES.en;
        const day = sendAt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" });
        const time = sendAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
        const noTime = mine === "1h" && !task.deadlineTime;
        return {
            tone: "info" as const,
            text:
                t(`Sent ${day} at ${time} to ${myEmail}.`, `Príde ${day} o ${time} na ${myEmail}.`, `Érkezik: ${day} ${time}, ide: ${myEmail}.`) +
                (noTime
                    ? " " +
                      t(
                          "The task has no deadline time, so it goes out in the morning.",
                          "Úloha nemá čas termínu, preto príde ráno.",
                          "A feladatnak nincs határidő-időpontja, ezért reggel érkezik.",
                      )
                    : ""),
        };
    })();

    return (
        <div data-testid="task-email-reminder" className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer has-[:disabled]:cursor-not-allowed">
                <span className="text-[10px] font-black text-indigo-700 uppercase flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    {t("Notify me about the task by e-mail", "Upozorniť ma na úlohu e-mailom", "Értesítés a feladatról e-mailben")}
                </span>
                <input
                    type="checkbox"
                    data-testid="task-email-reminder-toggle"
                    checked={!!mine}
                    disabled={disabled || !currentUserName}
                    onChange={(e) => set(e.target.checked ? "morning" : null)}
                    className="h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                />
            </label>

            {mine && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div
                        role="radiogroup"
                        aria-label={t("When to send", "Kedy poslať", "Mikor küldjük")}
                        className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-lg border border-indigo-100"
                    >
                        {TASK_EMAIL_REMINDERS.map((when) => (
                            <button
                                key={when}
                                type="button"
                                role="radio"
                                aria-checked={mine === when}
                                data-testid={`task-email-reminder-${when}`}
                                disabled={disabled}
                                onClick={() => set(when)}
                                className={`py-1.5 px-1 rounded-md font-black text-[9px] uppercase leading-tight transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${
                                    mine === when ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                                }`}
                            >
                                {optionLabel(when)}
                            </button>
                        ))}
                    </div>
                    {hint && (
                        <p
                            data-testid="task-email-reminder-hint"
                            className={`text-[10px] font-semibold leading-snug ${hint.tone === "warn" ? "text-amber-700" : "text-slate-500"}`}
                        >
                            {hint.text}
                        </p>
                    )}
                </div>
            )}

            {others.length > 0 && (
                <p className="text-[10px] font-semibold text-slate-500 leading-snug">
                    {t("Also reminded by e-mail:", "E-mailom sa pripomenie aj:", "E-mailben emlékeztetjük még:")} {others.join(", ")}
                </p>
            )}
        </div>
    );
};
