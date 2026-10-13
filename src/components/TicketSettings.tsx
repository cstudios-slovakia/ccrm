import React, { useState } from "react";
import {
  Ticket as TicketIcon,
  Plus,
  Trash2,
  Mail,
  Sparkles,
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import type {
  TicketPriority,
  TicketSettingsConfig,
  TicketStatusCategory,
  TicketStatusDef,
  TicketReplyTemplate,
} from "../types";
import type { Language } from "../utils/translations";
import {
  DEFAULT_TICKET_SETTINGS,
  DEFAULT_TICKET_STATUS_DEFS,
} from "../utils/tickets";

interface TicketSettingsProps {
  ticketStatuses: TicketStatusDef[];
  setTicketStatuses: React.Dispatch<React.SetStateAction<TicketStatusDef[]>>;
  ticketSettings: TicketSettingsConfig;
  setTicketSettings: React.Dispatch<React.SetStateAction<TicketSettingsConfig>>;
  userLanguage?: Language;
  canEdit?: boolean;
  onTicketsPolled?: () => void;
}

const STATUS_CATEGORIES: { id: TicketStatusCategory; labelSk: string; labelEn: string; labelHu: string }[] = [
  { id: "new", labelSk: "Nový (New)", labelEn: "New", labelHu: "Új (New)" },
  { id: "open", labelSk: "V riešení (Open)", labelEn: "In Progress (Open)", labelHu: "Folyamatban (Open)" },
  { id: "waiting", labelSk: "Čaká sa (Waiting)", labelEn: "Waiting", labelHu: "Várakozik (Waiting)" },
  { id: "resolved", labelSk: "Vyriešený (Resolved)", labelEn: "Resolved", labelHu: "Megoldva (Resolved)" },
  { id: "closed", labelSk: "Uzavretý (Closed)", labelEn: "Closed", labelHu: "Lezárva (Closed)" },
];

export const TicketSettings: React.FC<TicketSettingsProps> = ({
  ticketStatuses,
  setTicketStatuses,
  ticketSettings,
  setTicketSettings,
  userLanguage = "sk",
  canEdit = true,
  onTicketsPolled,
}) => {
  const tr = (sk: string, en: string, hu: string) =>
    userLanguage === "en" ? en : userLanguage === "hu" ? hu : sk;

  const [newStatusLabelSk, setNewStatusLabelSk] = useState("");
  const [newStatusLabelEn, setNewStatusLabelEn] = useState("");
  const [newStatusLabelHu, setNewStatusLabelHu] = useState("");
  const [newStatusCategory, setNewStatusCategory] = useState<TicketStatusCategory>("open");
  const [newStatusColor, setNewStatusColor] = useState("#3b82f6");

  const [imapTestStatus, setImapTestStatus] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  const [pollStatus, setPollStatus] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  const [newTplTitle, setNewTplTitle] = useState("");
  const [newTplShortcut, setNewTplShortcut] = useState("");
  const [newTplBody, setNewTplBody] = useState("");

  const handleAddStatus = () => {
    if (!canEdit || !newStatusLabelSk.trim()) return;
    const slug = newStatusLabelSk
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `status_${Date.now()}`;
    const uniqueId = ticketStatuses.some((s) => s.id === slug)
      ? `${slug}_${Date.now().toString().slice(-4)}`
      : slug;
    const nextOrder =
      ticketStatuses.reduce((max, s) => Math.max(max, s.sortOrder || 0), 0) + 1;
    const isWaitingOrDone =
      newStatusCategory === "waiting" ||
      newStatusCategory === "resolved" ||
      newStatusCategory === "closed";
    const isTerminal =
      newStatusCategory === "resolved" || newStatusCategory === "closed";

    const created: TicketStatusDef = {
      id: uniqueId,
      category: newStatusCategory,
      labelSk: newStatusLabelSk.trim(),
      labelEn: (newStatusLabelEn || newStatusLabelSk).trim(),
      labelHu: (newStatusLabelHu || newStatusLabelSk).trim(),
      color: newStatusColor,
      pausesSla: isWaitingOrDone,
      isTerminal,
      sortOrder: nextOrder,
    };
    setTicketStatuses((prev) => [...prev, created]);
    setNewStatusLabelSk("");
    setNewStatusLabelEn("");
    setNewStatusLabelHu("");
  };

  const handleUpdateStatus = (id: string, patch: Partial<TicketStatusDef>) => {
    if (!canEdit) return;
    setTicketStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const handleMoveStatus = (index: number, delta: number) => {
    if (!canEdit) return;
    setTicketStatuses((prev) => {
      const sorted = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      const target = index + delta;
      if (target < 0 || target >= sorted.length) return prev;
      const tmp = sorted[index];
      sorted[index] = sorted[target];
      sorted[target] = tmp;
      return sorted.map((s, idx) => ({ ...s, sortOrder: idx + 1 }));
    });
  };

  const handleDeleteStatus = (id: string) => {
    if (!canEdit || ticketStatuses.length <= 1) return;
    setTicketStatuses((prev) => prev.filter((s) => s.id !== id));
  };

  const handleTestImap = async () => {
    setImapTestStatus({ loading: true });
    try {
      const res = await fetch("./api/tickets.php?action=test_imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imapHost: ticketSettings.imapHost,
          imapPort: ticketSettings.imapPort,
          imapEncryption: ticketSettings.imapEncryption,
          imapUser: ticketSettings.imapUser,
          imapPassword: ticketSettings.imapPassword,
          imapFolder: ticketSettings.imapFolder,
        }),
      });
      const data = await res.json();
      setImapTestStatus({
        loading: false,
        ok: Boolean(data.success),
        message: data.message || (data.success ? "OK" : "Error"),
      });
    } catch (e: any) {
      setImapTestStatus({
        loading: false,
        ok: false,
        message: e?.message || "Connection test failed.",
      });
    }
  };

  const handlePollImapNow = async () => {
    setPollStatus({ loading: true });
    try {
      const res = await fetch("./api/tickets.php?action=poll_imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setPollStatus({
          loading: false,
          ok: true,
          message: tr(
            `Kontrola dokončená: ${data.created || 0} nových tiketov, ${data.replied || 0} odpovedí, ${data.skippedWhitelist || 0} preskočených (mimo whitelistu).`,
            `Poll finished: ${data.created || 0} new tickets, ${data.replied || 0} replies, ${data.skippedWhitelist || 0} skipped by whitelist.`,
            `Lekérdezés kész: ${data.created || 0} új jegy, ${data.replied || 0} válasz, ${data.skippedWhitelist || 0} kihagyva (whitelist).`,
          ),
        });
        if ((data.created || 0) > 0 || (data.replied || 0) > 0) {
          onTicketsPolled?.();
        }
      } else {
        setPollStatus({
          loading: false,
          ok: false,
          message: data.message || "IMAP poll failed.",
        });
      }
    } catch (e: any) {
      setPollStatus({
        loading: false,
        ok: false,
        message: e?.message || "IMAP poll error.",
      });
    }
  };

  const handleAddTemplate = () => {
    if (!canEdit || !newTplTitle.trim() || !newTplBody.trim()) return;
    const tpl: TicketReplyTemplate = {
      id: `tpl-${Date.now()}`,
      title: newTplTitle.trim(),
      shortcut: newTplShortcut.trim() || undefined,
      body: newTplBody.trim(),
    };
    setTicketSettings((prev) => ({
      ...prev,
      replyTemplates: [...(prev.replyTemplates || []), tpl],
    }));
    setNewTplTitle("");
    setNewTplShortcut("");
    setNewTplBody("");
  };

  const sortedStatuses = [...ticketStatuses].sort(
    (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99),
  );

  return (
    <div className="space-y-6">
      {/* 1. Customizable Ticket Statuses */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <TicketIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-body font-bold text-slate-900 dark:text-white">
                {tr(
                  "Vlastné stavy tiketov",
                  "Customizable Ticket Statuses",
                  "Egyéni jegyállapotok",
                )}
              </h3>
              <p className="text-caption text-slate-500 dark:text-slate-400">
                {tr(
                  "Prispôsobte si stavy tiketov, ich farby, kategórie a správanie SLA časovača.",
                  "Customize ticket statuses, colors, categories, and SLA timer pause/terminal rules.",
                  "Szabja testre a jegyállapotokat, színeket, kategóriákat és az SLA szabályokat.",
                )}
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setTicketStatuses(DEFAULT_TICKET_STATUS_DEFS)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {tr("Predvolené", "Reset Defaults", "Alaphelyzet")}
            </button>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {sortedStatuses.map((st, idx) => (
            <div
              key={st.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
            >
              <div className="md:col-span-1 flex items-center gap-1.5">
                <input
                  type="color"
                  value={st.color || "#3b82f6"}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleUpdateStatus(st.id, { color: e.target.value })
                  }
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={!canEdit || idx === 0}
                    onClick={() => handleMoveStatus(idx, -1)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || idx === sortedStatuses.length - 1}
                    onClick={() => handleMoveStatus(idx, 1)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <input
                  type="text"
                  value={st.labelSk}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleUpdateStatus(st.id, { labelSk: e.target.value })
                  }
                  placeholder="SK názov"
                  className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <input
                  type="text"
                  value={st.labelEn}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleUpdateStatus(st.id, { labelEn: e.target.value })
                  }
                  placeholder="EN label"
                  className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <input
                  type="text"
                  value={st.labelHu}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleUpdateStatus(st.id, { labelHu: e.target.value })
                  }
                  placeholder="HU név"
                  className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <select
                  value={st.category}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleUpdateStatus(st.id, {
                      category: e.target.value as TicketStatusCategory,
                    })
                  }
                  className="w-full px-2 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {STATUS_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {userLanguage === "en"
                        ? c.labelEn
                        : userLanguage === "hu"
                          ? c.labelHu
                          : c.labelSk}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-3 text-caption text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(st.pausesSla)}
                    disabled={!canEdit}
                    onChange={(e) =>
                      handleUpdateStatus(st.id, { pausesSla: e.target.checked })
                    }
                  />
                  <span>{tr("Pauza SLA", "Pause SLA", "SLA szünet")}</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(st.isTerminal)}
                    disabled={!canEdit}
                    onChange={(e) =>
                      handleUpdateStatus(st.id, { isTerminal: e.target.checked })
                    }
                  />
                  <span>{tr("Ukončený", "Done", "Lezárt")}</span>
                </label>
              </div>

              <div className="md:col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={!canEdit || sortedStatuses.length <= 1}
                  onClick={() => handleDeleteStatus(st.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  title={tr("Odstrániť stav", "Delete status", "Állapot törlése")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="md:col-span-1">
              <input
                type="color"
                value={newStatusColor}
                onChange={(e) => setNewStatusColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="md:col-span-3">
              <input
                type="text"
                value={newStatusLabelSk}
                onChange={(e) => setNewStatusLabelSk(e.target.value)}
                placeholder={tr("Nový stav (SK) *", "New status (SK) *", "Új állapot (SK) *")}
                className="w-full px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <input
                type="text"
                value={newStatusLabelEn}
                onChange={(e) => setNewStatusLabelEn(e.target.value)}
                placeholder="EN label"
                className="w-full px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <input
                type="text"
                value={newStatusLabelHu}
                onChange={(e) => setNewStatusLabelHu(e.target.value)}
                placeholder="HU név"
                className="w-full px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <select
                value={newStatusCategory}
                onChange={(e) =>
                  setNewStatusCategory(e.target.value as TicketStatusCategory)
                }
                className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {STATUS_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.labelSk}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleAddStatus}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                {tr("Pridať stav", "Add Status", "Állapot hozzáadása")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Support Email IMAP Polling & OpenAI Project Routing */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-body font-bold text-slate-900 dark:text-white">
                {tr(
                  "Support E-mail (IMAP Polling & SMTP) + OpenAI priradenie projektu",
                  "Support Email (IMAP Polling & SMTP) + OpenAI Project Routing",
                  "Támogatási E-mail (IMAP & SMTP) + OpenAI projekt-hozzárendelés",
                )}
              </h3>
              <p className="text-caption text-slate-500 dark:text-slate-400">
                {tr(
                  "Automatické sťahovanie e-mailov zo support schránky. Ak je nastavený OpenAI kľúč, AI automaticky vyberie prislúchajúci projekt.",
                  "Automatically poll support inbox via IMAP. When an OpenAI key is configured, AI automatically selects the matching project.",
                  "Bejövő levelek automatikus lekérdezése IMAP-on. Ha van OpenAI kulcs, az AI automatikusan kiválasztja a megfelelő projektet.",
                )}
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-ui font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(ticketSettings.imapEnabled)}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  imapEnabled: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded accent-orange-500"
            />
            <span>
              {tr("Povoliť IMAP polling", "Enable IMAP Polling", "IMAP lekérdezés engedélyezése")}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
              IMAP Host
            </label>
            <input
              type="text"
              value={ticketSettings.imapHost || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({ ...prev, imapHost: e.target.value }))
              }
              placeholder="imap.vasadomena.sk"
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
                IMAP Port
              </label>
              <input
                type="number"
                value={ticketSettings.imapPort ?? 993}
                disabled={!canEdit}
                onChange={(e) =>
                  setTicketSettings((prev) => ({
                    ...prev,
                    imapPort: parseInt(e.target.value || "993", 10),
                  }))
                }
                className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {tr("Šifrovanie", "Encryption", "Titkosítás")}
              </label>
              <select
                value={ticketSettings.imapEncryption || "ssl"}
                disabled={!canEdit}
                onChange={(e) =>
                  setTicketSettings((prev) => ({
                    ...prev,
                    imapEncryption: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="ssl">SSL / TLS</option>
                <option value="tls">STARTTLS</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr("Priečinok", "IMAP Folder", "IMAP Mappa")}
            </label>
            <input
              type="text"
              value={ticketSettings.imapFolder || "INBOX"}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  imapFolder: e.target.value,
                }))
              }
              placeholder="INBOX"
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr("IMAP Prihlasovacie meno", "IMAP Username / Email", "IMAP Felhasználónév")}
            </label>
            <input
              type="text"
              value={ticketSettings.imapUser || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({ ...prev, imapUser: e.target.value }))
              }
              placeholder="support@firma.sk"
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr("IMAP Heslo", "IMAP Password", "IMAP Jelszó")}
            </label>
            <input
              type="password"
              value={ticketSettings.imapPassword || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  imapPassword: e.target.value,
                }))
              }
              placeholder="••••••••"
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleTestImap}
              disabled={imapTestStatus.loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-caption font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {imapTestStatus.loading
                ? tr("Testujem...", "Testing...", "Tesztelés...")
                : tr("Otestovať IMAP", "Test IMAP", "IMAP teszt")}
            </button>
            <button
              type="button"
              onClick={handlePollImapNow}
              disabled={pollStatus.loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-caption font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw
                className={`w-4 h-4 ${pollStatus.loading ? "animate-spin" : ""}`}
              />
              {tr("Stiahnuť teraz", "Poll Now", "Lekérdezés most")}
            </button>
          </div>
        </div>

        {(imapTestStatus.message || pollStatus.message) && (
          <div className="space-y-2">
            {imapTestStatus.message && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-caption font-medium ${
                  imapTestStatus.ok
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{imapTestStatus.message}</span>
              </div>
            )}
            {pollStatus.message && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-caption font-medium ${
                  pollStatus.ok
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                    : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pollStatus.message}</span>
              </div>
            )}
          </div>
        )}

        {/* SMTP Outbound Support Replies */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-caption font-bold uppercase tracking-wider text-slate-400 mb-3">
            {tr(
              "Odchádzajúce odpovede (SMTP pre tikety)",
              "Outbound Support Replies (SMTP)",
              "Kimenő válaszok (SMTP)",
            )}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={ticketSettings.smtpHost || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({ ...prev, smtpHost: e.target.value }))
              }
              placeholder="SMTP Host (smtp.firma.sk)"
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <input
              type="number"
              value={ticketSettings.smtpPort ?? 465}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  smtpPort: parseInt(e.target.value || "465", 10),
                }))
              }
              placeholder="SMTP Port (465)"
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={ticketSettings.smtpUser || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({ ...prev, smtpUser: e.target.value }))
              }
              placeholder="SMTP User"
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <input
              type="password"
              value={ticketSettings.smtpPassword || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  smtpPassword: e.target.value,
                }))
              }
              placeholder="SMTP Password"
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* OpenAI Project Routing */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-ui font-bold text-slate-900 dark:text-white">
                  {tr(
                    "AI priradenie projektu cez OpenAI",
                    "OpenAI Automatic Project Routing",
                    "OpenAI automatikus projekt-hozzárendelés",
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(ticketSettings.aiRoutingEnabled)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setTicketSettings((prev) => ({
                      ...prev,
                      aiRoutingEnabled: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded accent-purple-500"
                />
              </div>
              <p className="text-caption text-slate-500 dark:text-slate-400">
                {tr(
                  "Ak je v systéme alebo nižšie nastavený OpenAI API kľúč, prichádzajúci e-mail sa automaticky priradí k správnemu projektu a určí sa jeho priorita. Ak má projekt/klient prázdny whitelist e-mailov, tikety sa príjmu bez obmedzenia.",
                  "If an OpenAI API key is set (globally or below), incoming emails are automatically routed to the matching project and prioritized. If a project/client has an empty email whitelist, tickets are accepted verbatim.",
                  "Ha be van állítva OpenAI API kulcs, a bejövő e-maileket az AI automatikusan a megfelelő projekthez rendeli.",
                )}
              </p>
            </div>
          </div>
          <div className="w-full md:w-72 shrink-0">
            <input
              type="password"
              value={ticketSettings.openAiKey || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({
                  ...prev,
                  openAiKey: e.target.value,
                }))
              }
              placeholder={tr(
                "Vlastný OpenAI kľúč (voliteľné)",
                "Optional OpenAI API Key override",
                "Opcionális OpenAI API kulcs",
              )}
              className="w-full px-3 py-2 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* 3. SLA Targets per Priority */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-body font-bold text-slate-900 dark:text-white">
              {tr("SLA Limity podľa priority", "SLA Targets by Priority", "SLA célértékek prioritás szerint")}
            </h3>
            <p className="text-caption text-slate-500 dark:text-slate-400">
              {tr(
                "Maximálny čas prvej odpovede a vyriešenia v minútach.",
                "Maximum first response and resolution time in minutes.",
                "Maximális első válaszidő és megoldási idő percben.",
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(["critical", "high", "normal", "low"] as TicketPriority[]).map(
            (prio) => {
              const target =
                ticketSettings.slaTargets?.[prio] ||
                DEFAULT_TICKET_SETTINGS.slaTargets[prio];
              return (
                <div
                  key={prio}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5"
                >
                  <div className="text-caption font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    {prio}
                  </div>
                  <div>
                    <label className="block text-micro text-slate-500 mb-1">
                      {tr("Prvá odpoveď (min)", "First Response (mins)", "Első válasz (perc)")}
                    </label>
                    <input
                      type="number"
                      min={5}
                      disabled={!canEdit}
                      value={target.firstResponseMins}
                      onChange={(e) => {
                        const val = parseInt(e.target.value || "60", 10);
                        setTicketSettings((prev) => ({
                          ...prev,
                          slaTargets: {
                            ...prev.slaTargets,
                            [prio]: {
                              ...target,
                              firstResponseMins: val,
                            },
                          },
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-micro text-slate-500 mb-1">
                      {tr("Vyriešenie (min)", "Resolution (mins)", "Megoldás (perc)")}
                    </label>
                    <input
                      type="number"
                      min={15}
                      disabled={!canEdit}
                      value={target.resolutionMins}
                      onChange={(e) => {
                        const val = parseInt(e.target.value || "240", 10);
                        setTicketSettings((prev) => ({
                          ...prev,
                          slaTargets: {
                            ...prev.slaTargets,
                            [prio]: {
                              ...target,
                              resolutionMins: val,
                            },
                          },
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* 4. Canned Reply Templates */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-body font-bold text-slate-900 dark:text-white">
              {tr("Šablóny rýchlych odpovedí", "Canned Reply Templates", "Sablon válaszok")}
            </h3>
            <p className="text-caption text-slate-500 dark:text-slate-400">
              {tr(
                "Predpripravené odpovede pre rýchlu komunikáciu v detaile tiketu.",
                "Pre-written replies for one-click insertion in the ticket composer.",
                "Előre megírt válaszok a gyors ügyfélszolgálati kommunikációhoz.",
              )}
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {(ticketSettings.replyTemplates || []).map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold text-slate-900 dark:text-white">
                    {tpl.title}
                  </span>
                  {tpl.shortcut && (
                    <span className="px-1.5 py-0.5 text-micro font-mono rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {tpl.shortcut}
                    </span>
                  )}
                </div>
                <p className="text-caption text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {tpl.body}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    setTicketSettings((prev) => ({
                      ...prev,
                      replyTemplates: (prev.replyTemplates || []).filter(
                        (x) => x.id !== tpl.id,
                      ),
                    }))
                  }
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder={tr("Názov šablóny", "Template Title", "Sablon címe")}
                className="md:col-span-2 px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={newTplShortcut}
                onChange={(e) => setNewTplShortcut(e.target.value)}
                placeholder={tr("Skratka (napr. /ack)", "Shortcut (e.g. /ack)", "Gyorsbillentyű (/ack)")}
                className="px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <textarea
                value={newTplBody}
                onChange={(e) => setNewTplBody(e.target.value)}
                placeholder={tr("Text šablóny odpovede...", "Reply template text...", "Sablon szövege...")}
                rows={2}
                className="flex-1 px-3 py-1.5 text-caption rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddTemplate}
                className="px-4 py-2 rounded-lg text-caption font-semibold bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              >
                {tr("Pridať šablónu", "Add Template", "Sablon hozzáadása")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
