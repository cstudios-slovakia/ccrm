import React, { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Mail,
  Sparkles,
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  GripVertical,
  Lock,
  Tag,
  X,
} from "lucide-react";
import type {
  Ticket,
  TicketPriority,
  TicketSettingsConfig,
  TicketStatusCategory,
  TicketStatusDef,
  TicketReplyTemplate,
} from "../types";
import type { Language } from "../utils/translations";
import {
  DEFAULT_TICKET_SETTINGS,
  NEW_TICKET_STATUS_COLOR,
  TICKET_STATUS_GROUPS,
  defaultTicketStatus,
  getTicketStatusLabel,
  ticketStatusKeyFor,
  ticketStatusLabel,
} from "../utils/tickets";
import { ColorPicker } from "./ui/ColorPicker";
import { CustomSelect } from "./ui/CustomSelect";
import { InlineRenameName } from "./ui/InlineRenameName";

interface TicketSettingsProps {
  ticketStatuses: TicketStatusDef[];
  setTicketStatuses: React.Dispatch<React.SetStateAction<TicketStatusDef[]>>;
  ticketSettings: TicketSettingsConfig;
  setTicketSettings: React.Dispatch<React.SetStateAction<TicketSettingsConfig>>;
  tickets?: Ticket[];
  setTickets?: (updater: Ticket[] | ((prev: Ticket[]) => Ticket[])) => void;
  userLanguage?: Language;
  canEdit?: boolean;
  onTicketsPolled?: () => void;
  /**
   * Which panels to draw. Settings shows the statuses and the intake side (mailbox,
   * SLA targets, canned replies) as two sections; the default is both.
   */
  part?: "statuses" | "intake";
}

type Row =
  | { type: "divider"; group: TicketStatusCategory }
  | { type: "status"; def: TicketStatusDef };

const isOpenGroup = (g: TicketStatusCategory) =>
  g === "new" || g === "open" || g === "waiting";

const applyGroupFlags = (
  def: TicketStatusDef,
  group: TicketStatusCategory,
  sortOrder: number,
): TicketStatusDef => ({
  ...def,
  category: group,
  group,
  pausesSla: group === "waiting" || group === "resolved" || group === "closed",
  isTerminal: group === "resolved" || group === "closed",
  sortOrder,
});

export const TicketSettings: React.FC<TicketSettingsProps> = ({
  ticketStatuses,
  setTicketStatuses,
  ticketSettings,
  setTicketSettings,
  tickets = [],
  setTickets,
  userLanguage = "sk",
  canEdit = true,
  onTicketsPolled,
  part,
}) => {
  const tr = (sk: string, en: string, hu: string) =>
    userLanguage === "en" ? en : userLanguage === "hu" ? hu : sk;
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  const toast = (msg: string) =>
    (window as unknown as { showToast?: (m: string) => void }).showToast?.(msg);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<TicketStatusCategory>("open");

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

  const labelOf = (def: TicketStatusDef) =>
    getTicketStatusLabel(def, userLanguage, def.id);

  const groupInfo = (
    g: TicketStatusCategory,
  ): { name: string; desc: string; chip: string } => {
    switch (g) {
      case "new":
        return {
          name: t("New", "Nové", "Új"),
          desc: t(
            "Where every new ticket starts",
            "Tu začína každý nový tiket",
            "Itt indul minden új jegy",
          ),
          chip: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "open":
        return {
          name: t("In progress", "Prebiehajúce", "Folyamatban"),
          desc: t(
            "The ticket is being worked on",
            "Na tikete sa pracuje",
            "A jegyen dolgoznak",
          ),
          chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
        };
      case "waiting":
        return {
          name: t("Waiting", "Čaká sa", "Várakozik"),
          desc: t(
            "Waiting on client or third party — pauses the SLA timer",
            "Čaká sa na klienta alebo tretiu stranu — pozastaví SLA časovač",
            "Ügyfélre vagy harmadik félre vár — szünetelteti az SLA időzítőt",
          ),
          chip: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "resolved":
        return {
          name: t("Resolved", "Vyriešené", "Megoldva"),
          desc: t(
            "Solved and done — stops the SLA timer",
            "Vyriešené a hotové — zastaví SLA časovač",
            "Megoldva és kész — leállítja az SLA időzítőt",
          ),
          chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "closed":
        return {
          name: t("Closed", "Uzavreté", "Lezárva"),
          desc: t(
            "Closed without further action — stops the SLA timer",
            "Uzavreté bez ďalších krokov — zastaví SLA časovač",
            "További teendő nélkül lezárva — leállítja az SLA időzítőt",
          ),
          chip: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  };

  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach((tk) => {
      if (tk.status) counts[tk.status] = (counts[tk.status] || 0) + 1;
    });
    return counts;
  }, [tickets]);

  const sortedStatuses = useMemo(
    () =>
      [...ticketStatuses].sort(
        (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99),
      ),
    [ticketStatuses],
  );

  const rows: Row[] = TICKET_STATUS_GROUPS.flatMap((group) => [
    { type: "divider" as const, group },
    ...sortedStatuses
      .filter((d) => (d.category || d.group || "open") === group)
      .map((def) => ({ type: "status" as const, def })),
  ]);

  const nameTaken = (name: string, exceptId?: string) =>
    ticketStatuses.some(
      (d) =>
        d.id !== exceptId &&
        labelOf(d).toLowerCase() === name.trim().toLowerCase(),
    );

  const openCountWithout = (id: string) =>
    ticketStatuses.filter(
      (d) => d.id !== id && isOpenGroup(d.category || d.group || "open"),
    ).length;

  const handleMoveToIndex = (id: string, targetIdx: number) => {
    if (!canEdit) return;
    const items = [...rows];
    const from = items.findIndex((r) => r.type === "status" && r.def.id === id);
    if (from === -1) return;
    const [dragged] = items.splice(from, 1);
    items.splice(targetIdx, 0, dragged);

    const next: TicketStatusDef[] = [];
    let group: TicketStatusCategory = "new";
    items.forEach((r) => {
      if (r.type === "divider") {
        group = r.group;
      } else {
        next.push(applyGroupFlags(r.def, group, next.length + 1));
      }
    });

    if (!next.some((d) => isOpenGroup(d.category))) {
      toast(
        t(
          "At least one status must stay open (New, In progress, or Waiting) — that is where tickets start.",
          "Aspoň jeden stav musí zostať otvorený (Nové, Prebiehajúce alebo Čaká sa) — tam tikety začínajú.",
          "Legalább egy állapotnak nyitottnak kell maradnia (Új, Folyamatban vagy Várakozik) — ott indulnak a jegyek.",
        ),
      );
      return;
    }

    const ordered = TICKET_STATUS_GROUPS.flatMap((g) =>
      next.filter((d) => d.category === g),
    ).map((d, idx) => ({ ...d, sortOrder: idx + 1 }));
    setTicketStatuses(ordered);
  };

  const handleRename = (id: string, raw: string) => {
    if (!canEdit) return;
    const label = raw.trim();
    const target = ticketStatuses.find((d) => d.id === id);
    if (!target || !label || label === labelOf(target)) return;
    if (nameTaken(label, id)) {
      toast(
        t(
          "This name already exists!",
          "Tento názov už existuje!",
          "Ez a név már létezik!",
        ),
      );
      return;
    }
    setTicketStatuses((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              label,
              labelSk: userLanguage === "sk" ? label : d.labelSk || label,
              labelEn: userLanguage === "en" ? label : d.labelEn || label,
              labelHu: userLanguage === "hu" ? label : d.labelHu || label,
            }
          : d,
      ),
    );
  };

  const handleColor = (id: string, color: string) => {
    if (!canEdit) return;
    setTicketStatuses((prev) =>
      prev.map((d) => (d.id === id ? { ...d, color } : d)),
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const label = newName.trim();
    if (!label) return;
    if (nameTaken(label)) {
      toast(
        t(
          "This ticket status already exists!",
          "Tento stav tiketu už existuje!",
          "Ez a jegyállapot már létezik!",
        ),
      );
      return;
    }
    const taken = [...ticketStatuses.map((d) => d.id), ...Object.keys(usage)];
    const key = ticketStatusKeyFor(label, taken);
    const created: TicketStatusDef = applyGroupFlags(
      {
        id: key,
        category: newGroup,
        group: newGroup,
        label,
        labelSk: label,
        labelEn: label,
        labelHu: label,
        color: NEW_TICKET_STATUS_COLOR,
        pausesSla: false,
        isTerminal: false,
        sortOrder: ticketStatuses.length + 1,
      },
      newGroup,
      ticketStatuses.length + 1,
    );
    setTicketStatuses((prev) =>
      TICKET_STATUS_GROUPS.flatMap((g) =>
        [...prev, created].filter((d) => (d.category || d.group) === g),
      ).map((d, idx) => ({ ...d, sortOrder: idx + 1 })),
    );
    setNewName("");
  };

  const handleRemove = (def: TicketStatusDef) => {
    if (!canEdit) return;
    const group = def.category || def.group || "open";
    if (isOpenGroup(group) && openCountWithout(def.id) === 0) {
      toast(
        t(
          "At least one open status (New, In progress, or Waiting) is required — that is where tickets start.",
          "Je potrebný aspoň jeden otvorený stav (Nové, Prebiehajúce alebo Čaká sa) — tam tikety začínajú.",
          "Legalább egy nyitott állapot (Új, Folyamatban vagy Várakozik) szükséges — ott indulnak a jegyek.",
        ),
      );
      return;
    }
    const remaining = ticketStatuses
      .filter((d) => d.id !== def.id)
      .map((d, idx) => ({ ...d, sortOrder: idx + 1 }));
    const fallback = defaultTicketStatus(remaining);
    const inUse = usage[def.id] || 0;
    const name = labelOf(def);
    const fallbackName = ticketStatusLabel(fallback, userLanguage, remaining);
    const question =
      inUse > 0
        ? t(
            `Remove the status "${name}"? ${inUse} ticket(s) in it will be moved to "${fallbackName}".`,
            `Odstrániť stav "${name}"? ${inUse} tiket(ov) v ňom sa presunie do stavu "${fallbackName}".`,
            `Eltávolítja a(z) "${name}" állapotot? A benne lévő ${inUse} jegy a(z) "${fallbackName}" állapotba kerül.`,
          )
        : t(
            `Remove the status "${name}"?`,
            `Odstrániť stav "${name}"?`,
            `Eltávolítja a(z) "${name}" állapotot?`,
          );
    if (!confirm(question)) return;
    setTicketStatuses(remaining);
    if (inUse > 0 && setTickets) {
      setTickets((prev) =>
        prev.map((tk) => (tk.status === def.id ? { ...tk, status: fallback } : tk)),
      );
    }
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

  return (
    <div className="space-y-6">
      {part !== "intake" && (<>
      {/* 1. Ticket Statuses (ProjectStatusSettings style) */}
      <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
        <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
          <Tag className="h-4.5 w-4.5 text-indigo-500" />
          {t("Ticket statuses", "Stavy tiketov", "Jegyállapotok")}
        </h3>

        <p className="type-overline text-slate-400">
          {t(
            "Drag statuses up or down relative to the group dividers to reorder them and change their group. Click a status's colour dot to change its colour.",
            "Presunutím stavov nahor alebo nadol vzhľadom na oddeľovače skupín zmeníte ich poradie aj skupinu. Kliknutím na farebný bod zmeníte farbu stavu.",
            "Húzza az állapotokat a csoportelválasztókhoz képest fel vagy le a sorrend és a csoport módosításához. A színes pontra kattintva módosíthatja a színt.",
          )}
        </p>

        <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-inner bg-white/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                <th className="py-3 px-4 type-overline text-slate-500 w-12 text-center">
                  {t("Drag", "Ťahať", "Húzás")}
                </th>
                <th className="py-3 px-4 type-overline text-slate-500 w-44">
                  {t("Colour", "Farba", "Szín")}
                </th>
                <th className="py-3 px-4 type-overline text-slate-500">
                  {t("Status name", "Názov stavu", "Állapot neve")}
                </th>
                <th className="py-3 px-4 type-overline text-slate-500 w-36">
                  {t("Group", "Skupina", "Csoport")}
                </th>
                <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">
                  {t("Tickets", "Tikety", "Jegyek")}
                </th>
                <th className="py-3 px-4 type-overline text-slate-500 w-16 text-center">
                  {t("Delete", "Zmazať", "Törlés")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isDragOver = dragOverIndex === idx;
                const onDragOver = (e: React.DragEvent) => {
                  e.preventDefault();
                  if (
                    canEdit &&
                    draggedId &&
                    (row.type === "divider" || row.def.id !== draggedId)
                  ) {
                    setDragOverIndex(idx);
                  }
                };
                const onDrop = (e: React.DragEvent) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  if (draggedId) {
                    handleMoveToIndex(draggedId, idx);
                    setDraggedId(null);
                  }
                };

                if (row.type === "divider") {
                  const info = groupInfo(row.group);
                  return (
                    <tr
                      key={`div-${row.group}`}
                      data-testid={`ticket-status-divider-${row.group}`}
                      onDragOver={onDragOver}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={onDrop}
                      className={`transition-all border-b border-slate-200/60 duration-200 ${
                        isDragOver
                          ? "bg-indigo-50/60 scale-[0.99] border-2 border-dashed border-indigo-300"
                          : "bg-slate-100/70"
                      }`}
                    >
                      <td colSpan={6} className="py-3 px-4 select-none">
                        <div className="flex items-center gap-2">
                          <span className="type-overline text-slate-900">
                            {info.name}
                          </span>
                          <span className="text-micro text-slate-400 font-bold ml-1">
                            {info.desc}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const { def } = row;
                const label = labelOf(def);
                const group = def.category || def.group || "open";
                const info = groupInfo(group);
                const count = usage[def.id] || 0;

                return (
                  <tr
                    key={`status-${def.id}`}
                    data-testid={`ticket-status-row-${def.id}`}
                    draggable={canEdit}
                    onDragStart={() => canEdit && setDraggedId(def.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={onDragOver}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={onDrop}
                    className={`border-b border-slate-200/60 hover:bg-slate-50/50 transition-all duration-200 ${
                      isDragOver
                        ? "bg-indigo-50/55 scale-[0.99] border-y-2 border-dashed border-indigo-300"
                        : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-center align-middle">
                      {canEdit ? (
                        <GripVertical className="h-4 w-4 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing inline-block" />
                      ) : (
                        <Lock className="h-3 w-3 text-slate-300 inline-block" />
                      )}
                    </td>

                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center gap-2">
                        {canEdit ? (
                          <ColorPicker
                            variant="ring"
                            value={def.color}
                            onChange={(next) => handleColor(def.id, next)}
                            title={t(
                              "Click to edit color",
                              "Kliknutím upravíte farbu",
                              "Kattintson a szín szerkesztéséhez",
                            )}
                          />
                        ) : (
                          <span
                            className="h-3 w-3 rounded-full border border-slate-200 inline-block"
                            style={{ backgroundColor: def.color }}
                          />
                        )}
                        <span className="type-overline text-slate-400">
                          {def.color}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 align-middle">
                      <InlineRenameName
                        value={label}
                        canEdit={canEdit}
                        onCommit={(next) => handleRename(def.id, next)}
                        renameTitle={t("Rename", "Premenovať", "Átnevezés")}
                      >
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-ui font-bold border"
                          style={{
                            backgroundColor: `${def.color}12`,
                            color: def.color,
                            borderColor: `${def.color}35`,
                          }}
                        >
                          {label}
                        </span>
                      </InlineRenameName>
                    </td>

                    <td className="py-3 px-4 align-middle select-none">
                      <span
                        className={`px-2.5 py-0.5 rounded-full type-overline border ${info.chip}`}
                      >
                        {info.name}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center align-middle select-none">
                      <span
                        className={`text-ui font-bold ${
                          count ? "text-slate-700" : "text-slate-300"
                        }`}
                      >
                        {count}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center align-middle">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleRemove(def)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block cursor-pointer"
                          title={t(
                            "Remove status",
                            "Odstrániť stav",
                            "Állapot eltávolítása",
                          )}
                          aria-label={t(
                            "Remove status",
                            "Odstrániť stav",
                            "Állapot eltávolítása",
                          )}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="type-overline text-slate-300 block select-none">
                          {t("Locked", "Zamknuté", "Zárolt")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <form
            onSubmit={handleAdd}
            className="flex flex-wrap gap-2 max-w-lg pt-2 items-center"
          >
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t(
                "Add new ticket status...",
                "Pridať nový stav tiketu...",
                "Új jegyállapot hozzáadása...",
              )}
              aria-label={t(
                "New ticket status",
                "Nový stav tiketu",
                "Új jegyállapot",
              )}
              className="flex-1 min-w-37.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
            />
            <div className="w-40">
              <CustomSelect
                value={newGroup}
                onChange={(v) => setNewGroup(v as TicketStatusCategory)}
                options={TICKET_STATUS_GROUPS.map((g) => ({
                  value: g,
                  label: groupInfo(g).name,
                }))}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-ui font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />{" "}
              {t("Add status", "Pridať stav", "Állapot hozzáadása")}
            </button>
          </form>
        )}
      </div>
      </>)}

      {part !== "statuses" && (<>
      {/* 2. Support Email IMAP Polling & OpenAI Project Routing */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-body font-bold text-slate-900">
                {tr(
                  "Support E-mail (IMAP Polling & SMTP) + OpenAI priradenie projektu",
                  "Support Email (IMAP Polling & SMTP) + OpenAI Project Routing",
                  "Támogatási E-mail (IMAP & SMTP) + OpenAI projekt-hozzárendelés",
                )}
              </h3>
              <p className="text-caption text-slate-500">
                {tr(
                  "Automatické sťahovanie e-mailov zo support schránky. Ak je nastavený OpenAI kľúč, AI automaticky vyberie prislúchajúci projekt.",
                  "Automatically poll support inbox via IMAP. When an OpenAI key is configured, AI automatically selects the matching project.",
                  "Bejövő levelek automatikus lekérdezése IMAP-on. Ha van OpenAI kulcs, az AI automatikusan kiválasztja a megfelelő projektet.",
                )}
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-ui font-semibold text-slate-700 cursor-pointer">
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
            <label className="block text-caption font-semibold text-slate-500 mb-1">
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
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-caption font-semibold text-slate-500 mb-1">
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
                className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-slate-500 mb-1">
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
                className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              >
                <option value="ssl">SSL / TLS</option>
                <option value="tls">STARTTLS</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 mb-1">
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
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 mb-1">
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
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
          <div>
            <label className="block text-caption font-semibold text-slate-500 mb-1">
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
              className="w-full px-3 py-2 text-ui rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleTestImap}
              disabled={imapTestStatus.loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-caption font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-600 border border-red-500/20"
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
                    ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                    : "bg-red-500/10 text-red-600 border border-red-500/20"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pollStatus.message}</span>
              </div>
            )}
          </div>
        )}

        {/* SMTP Outbound Support Replies */}
        <div className="pt-4 border-t border-slate-200">
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
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
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
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
            <input
              type="text"
              value={ticketSettings.smtpUser || ""}
              disabled={!canEdit}
              onChange={(e) =>
                setTicketSettings((prev) => ({ ...prev, smtpUser: e.target.value }))
              }
              placeholder="SMTP User"
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
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
              className="px-3 py-2 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
        </div>

        {/* OpenAI Project Routing */}
        <div className="pt-4 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-ui font-bold text-slate-900">
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
              <p className="text-caption text-slate-500">
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
              className="w-full px-3 py-2 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* 3. SLA Targets per Priority */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-body font-bold text-slate-900">
              {tr("SLA Limity podľa priority", "SLA Targets by Priority", "SLA célértékek prioritás szerint")}
            </h3>
            <p className="text-caption text-slate-500">
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
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                >
                  <div className="text-caption font-bold uppercase tracking-wider text-slate-700">
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
                      className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 bg-white text-slate-900"
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
                      className="w-full px-2.5 py-1.5 text-caption rounded-lg border border-slate-200 bg-white text-slate-900"
                    />
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* 4. Canned Reply Templates */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-body font-bold text-slate-900">
              {tr("Šablóny rýchlych odpovedí", "Canned Reply Templates", "Sablon válaszok")}
            </h3>
            <p className="text-caption text-slate-500">
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
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold text-slate-900">
                    {tpl.title}
                  </span>
                  {tpl.shortcut && (
                    <span className="px-1.5 py-0.5 text-micro font-mono rounded bg-slate-200 text-slate-700">
                      {tpl.shortcut}
                    </span>
                  )}
                </div>
                <p className="text-caption text-slate-600 whitespace-pre-wrap">
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
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder={tr("Názov šablóny", "Template Title", "Sablon címe")}
                className="md:col-span-2 px-3 py-1.5 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              />
              <input
                type="text"
                value={newTplShortcut}
                onChange={(e) => setNewTplShortcut(e.target.value)}
                placeholder={tr("Skratka (napr. /ack)", "Shortcut (e.g. /ack)", "Gyorsbillentyű (/ack)")}
                className="px-3 py-1.5 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              />
            </div>
            <div className="flex gap-2">
              <textarea
                value={newTplBody}
                onChange={(e) => setNewTplBody(e.target.value)}
                placeholder={tr("Text šablóny odpovede...", "Reply template text...", "Sablon szövege...")}
                rows={2}
                className="flex-1 px-3 py-1.5 text-caption rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
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
      </>)}
    </div>
  );
};
