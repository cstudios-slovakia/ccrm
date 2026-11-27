import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Search, Ticket as TicketIcon, X } from "lucide-react";
import type { Ticket, TicketStatusDef } from "../../types";
import { isClosedTicketStatus } from "../../utils/tickets";
import { buildTicketHash } from "../../utils/ticketEmailLinks";

interface EmailTicketLinkerProps {
  tickets: Ticket[];
  ticketStatuses?: TicketStatusDef[];
  linkedTickets: Ticket[];
  canEdit: boolean;
  onLinkTicket: (ticketId: string) => void;
  onUnlinkTicket: (ticketId: string) => void;
  t: (en: string, sk: string, hu: string) => string;
}

export const EmailTicketLinker: React.FC<EmailTicketLinkerProps> = ({
  tickets,
  ticketStatuses,
  linkedTickets,
  canEdit,
  onLinkTicket,
  onUnlinkTicket,
  t,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkedIds = useMemo(() => new Set(linkedTickets.map((tk) => tk.id)), [linkedTickets]);

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tickets.filter((tk) => {
      if (tk.archived || tk.isArchived) return false;
      if (!q) return true;
      return (
        (tk.ticketNumber || "").toLowerCase().includes(q) ||
        (tk.subject || "").toLowerCase().includes(q) ||
        (tk.reporterName || "").toLowerCase().includes(q) ||
        (tk.reporterEmail || "").toLowerCase().includes(q)
      );
    });
    return [...list]
      .sort((a, b) => {
        const aClosed = isClosedTicketStatus(a.status, ticketStatuses) ? 1 : 0;
        const bClosed = isClosedTicketStatus(b.status, ticketStatuses) ? 1 : 0;
        if (aClosed !== bClosed) return aClosed - bClosed;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      })
      .slice(0, 40);
  }, [tickets, ticketStatuses, query]);

  if (!canEdit && linkedTickets.length === 0) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5" ref={popRef}>
      {linkedTickets.map((tk) => (
        <span
          key={tk.id}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg text-ui font-bold border bg-violet-50 text-violet-700 border-violet-200 max-w-64"
        >
          <button
            type="button"
            onClick={() => {
              window.location.hash = buildTicketHash(tk.id);
            }}
            className="inline-flex items-center gap-1 min-w-0 hover:underline cursor-pointer text-left"
            title={`${tk.ticketNumber} · ${tk.subject}`}
          >
            <TicketIcon size={13} className="shrink-0" />
            <span className="shrink-0">{tk.ticketNumber}</span>
            <span className="truncate font-semibold opacity-80">{tk.subject}</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onUnlinkTicket(tk.id)}
              className="h-4.5 w-4.5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-200/70 hover:text-violet-900 cursor-pointer shrink-0"
              title={t("Unlink ticket", "Odpojiť tiket", "Jegy leválasztása")}
              aria-label={t("Unlink ticket", "Odpojiť tiket", "Jegy leválasztása")}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}

      {canEdit && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border border-dashed border-violet-300 bg-white text-violet-700 hover:bg-violet-50 hover:border-violet-400 transition-colors cursor-pointer"
            title={t("Connect with a ticket", "Prepojiť s tiketom", "Összekapcsolás jeggyel")}
          >
            <Link2 size={13} />
            <span>{t("Link ticket", "Pripojiť tiket", "Jegy csatolása")}</span>
          </button>

          {open && (
            <div className="absolute left-0 mt-1.5 z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden text-left">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("Search ticket # or subject...", "Hľadať tiket alebo predmet...", "Jegy # vagy tárgy keresése...")}
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-caption font-medium text-gray-800 focus:outline-none focus:border-violet-400 focus:bg-white"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {filteredTickets.length === 0 ? (
                  <div className="px-3 py-4 text-center text-caption text-gray-400">
                    {t("No matching tickets.", "Žiadne zodpovedajúce tikety.", "Nincs találat jegyre.")}
                  </div>
                ) : (
                  filteredTickets.map((tk) => {
                    const isLinked = linkedIds.has(tk.id);
                    const closed = isClosedTicketStatus(tk.status, ticketStatuses);
                    return (
                      <button
                        key={tk.id}
                        type="button"
                        onClick={() => {
                          if (isLinked) {
                            onUnlinkTicket(tk.id);
                          } else {
                            onLinkTicket(tk.id);
                            setOpen(false);
                          }
                        }}
                        className={`w-full px-3 py-2 flex items-start gap-2 text-left transition-colors cursor-pointer ${
                          isLinked ? "bg-violet-50/70 hover:bg-violet-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <TicketIcon size={14} className={`mt-0.5 shrink-0 ${closed ? "text-gray-400" : "text-violet-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-micro font-bold text-violet-700 shrink-0">{tk.ticketNumber}</span>
                            {closed && (
                              <span className="px-1.5 py-0.25 rounded bg-gray-100 text-gray-500 text-micro font-semibold shrink-0">
                                {tk.status}
                              </span>
                            )}
                          </div>
                          <div className="text-caption font-semibold text-gray-800 truncate">{tk.subject}</div>
                        </div>
                        {isLinked && <Check size={14} className="mt-0.5 text-violet-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
