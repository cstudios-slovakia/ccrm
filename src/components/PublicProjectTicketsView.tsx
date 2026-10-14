import React, { useEffect, useState, useMemo } from "react";
import {
  Ticket as TicketIcon,
  CheckCircle2,
  Clock,
  Search,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

interface PublicTicketMessage {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface PublicTicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  messages: PublicTicketMessage[];
}

interface PublicStatusDef {
  id?: string;
  key: string;
  labelEn: string;
  labelSk: string;
  labelHu: string;
  color: string;
  isClosed?: boolean;
  isTerminal?: boolean;
  sortOrder: number;
}

export const PublicProjectTicketsView: React.FC<{ hash: string; language?: string }> = ({ hash }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [clientName, setClientName] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PublicStatusDef[]>([]);
  const [tickets, setTickets] = useState<PublicTicketItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `./api/tickets.php?action=public_status&hash=${encodeURIComponent(hash)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || data.error || "Invalid or expired public ticket status link.");
      } else {
        setProjectName(data.project?.name || "Project");
        setClientName(data.project?.clientName || null);
        setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load ticket status board.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [hash]);

  const statusMap = useMemo(() => {
    const m = new Map<string, PublicStatusDef>();
    statuses.forEach((s) => {
      if (s.key) m.set(s.key, s);
      if (s.id) m.set(s.id, s);
    });
    return m;
  }, [statuses]);

  const counts = useMemo(() => {
    let open = 0;
    let resolved = 0;
    tickets.forEach((tk) => {
      const st = statusMap.get(tk.status);
      if (st?.isClosed || st?.isTerminal || tk.status === "resolved" || tk.status === "closed") {
        resolved++;
      } else {
        open++;
      }
    });
    return { total: tickets.length, open, resolved };
  }, [tickets, statusMap]);

  const filtered = useMemo(() => {
    return tickets.filter((tk) => {
      if (statusFilter !== "all" && tk.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          tk.ticketNumber.toLowerCase().includes(q) ||
          tk.subject.toLowerCase().includes(q) ||
          (tk.reporterName || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, search]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-600 font-heading font-bold">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          <span>Loading project ticket statuses...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-title-sm text-slate-900">
            Status Board Unavailable
          </h1>
          <p className="text-caption text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-10 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <TicketIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-micro font-bold uppercase tracking-wider text-indigo-600">
                Live Support Status Board
              </div>
              <h1 className="font-heading font-extrabold text-title-md text-slate-900">
                {projectName}
              </h1>
              {clientName && (
                <div className="text-caption font-semibold text-slate-500">{clientName}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-caption font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-title-md font-heading font-extrabold text-slate-900">
              {counts.total}
            </div>
            <div className="text-micro font-bold uppercase tracking-wider text-slate-400">
              Total Tickets
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-200 p-4">
            <div className="text-title-md font-heading font-extrabold text-indigo-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{counts.open}</span>
            </div>
            <div className="text-micro font-bold uppercase tracking-wider text-slate-400">
              Open / In Progress
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <div className="text-title-md font-heading font-extrabold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{counts.resolved}</span>
            </div>
            <div className="text-micro font-bold uppercase tracking-wider text-slate-400">
              Resolved
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket number or subject..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-caption font-semibold"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-caption font-bold text-slate-700"
          >
            <option value="all">All Statuses</option>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>
                {s.labelEn || s.key}
              </option>
            ))}
          </select>
        </div>

        {/* Tickets List */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-caption font-semibold">
              No tickets found for this project.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((tk) => {
                const st = statusMap.get(tk.status);
                const color = st?.color || "#6366f1";
                const label = st?.labelEn || tk.status;
                const isExpanded = expandedId === tk.id;

                return (
                  <div key={tk.id} className="p-4 sm:p-5 space-y-3">
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : tk.id)}
                      className="flex items-start justify-between gap-3 cursor-pointer"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-micro font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            {tk.ticketNumber}
                          </span>
                          <span className="text-micro font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {tk.priority}
                          </span>
                          <span className="text-micro text-slate-400">
                            Reported by <strong>{tk.reporterName || "Client"}</strong> on{" "}
                            {String(tk.createdAt || "").slice(0, 16)}
                          </span>
                        </div>
                        <h3 className="font-heading font-bold text-ui text-slate-900">
                          {tk.subject}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="px-3 py-1 rounded-full text-micro font-bold border"
                          style={{
                            backgroundColor: `${color}15`,
                            color,
                            borderColor: `${color}40`,
                          }}
                        >
                          {label}
                        </span>
                        <span className="text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="text-micro font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Updates & Conversation ({(tk.messages || []).length})</span>
                        </div>
                        {(tk.messages || []).length === 0 ? (
                          <div className="text-caption text-slate-400 italic">
                            No public messages recorded yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {tk.messages.map((m) => (
                              <div
                                key={m.id}
                                className={`p-3 rounded-2xl border text-caption ${
                                  m.authorType === "agent"
                                    ? "bg-indigo-50/50 border-indigo-200"
                                    : "bg-slate-50 border-slate-200"
                                }`}
                              >
                                <div className="flex items-center justify-between text-micro text-slate-500 mb-1">
                                  <strong className="text-slate-800">{m.authorName}</strong>
                                  <span>{String(m.createdAt || "").slice(0, 16)}</span>
                                </div>
                                <div className="whitespace-pre-wrap text-slate-700">{m.body}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

