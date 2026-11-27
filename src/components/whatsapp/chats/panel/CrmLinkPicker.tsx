import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Link2, Loader2, Search, X } from "lucide-react";
import type { ChatCrmEntity, ChatCrmLinks } from "../../api/contract.ts";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  conversationId: string;
  crmLinks: ChatCrmLinks;
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  onLink: (entity: ChatCrmEntity) => Promise<void>;
  onUnlink: (entity: ChatCrmEntity) => Promise<void>;
  onSearch: (query: string) => Promise<ChatCrmEntity[]>;
  searchResults: ChatCrmEntity[];
  searching: boolean;
  saving: boolean;
  onOpenRecord?: (kind: "lead" | "project", id: string) => void;
}

export const CrmLinkPicker = ({
  crmLinks,
  isOpen,
  onClose,
  language = "en",
  onLink,
  onUnlink,
  onSearch,
  searchResults,
  searching,
  saving,
  onOpenRecord,
}: Props) => {
  const t = getPanelI18n(language).crmLink;
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void onSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, query, onSearch]);

  if (!isOpen) return null;

  const entityLabel = (e: ChatCrmEntity) => (e.entity_type === "project" ? t.project : t.lead);

  const ambiguousText = crmLinks.ambiguous
    ? crmLinks.ambiguous.kind === "client"
      ? t.ambiguousClient(crmLinks.ambiguous.candidates.length)
      : t.ambiguousLead(crmLinks.ambiguous.candidates.length)
    : null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t.title}
      className="absolute right-0 top-full z-40 mt-2 flex w-80 max-w-sm flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <Link2 className="size-4 text-green-600" aria-hidden />
          <span className="type-card-title">{t.title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-4" />
        </button>
      </div>

      <p className="type-meta text-slate-500">{t.hint}</p>

      {/* Linked records */}
      {crmLinks.links.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="type-meta font-bold uppercase tracking-wider text-slate-400">
            {t.linkedSection}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {crmLinks.links.map((link) => (
              <li
                key={`${link.entity_type}:${link.crm_id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="type-body truncate font-medium text-slate-800">{link.name}</p>
                  <p className="type-meta text-slate-500">
                    {entityLabel(link)} · {link.source === "manual" ? t.manual : t.auto}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {onOpenRecord && (
                    <button
                      type="button"
                      onClick={() => onOpenRecord(link.entity_type, link.crm_id)}
                      title={t.openInCrm}
                      className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onUnlink(link)}
                    title={t.unlink}
                    aria-label={t.unlink}
                    className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ambiguous candidates */}
      {crmLinks.ambiguous && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="size-3.5" />
            <h4 className="type-meta font-bold">{ambiguousText}</h4>
          </div>
          <ul className="flex flex-col gap-1">
            {crmLinks.ambiguous.candidates.map((cand) => (
              <li key={`${cand.entity_type}:${cand.crm_id}`}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onLink(cand)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-left transition-colors hover:bg-amber-100/60 disabled:opacity-50"
                >
                  <span className="type-body truncate font-medium text-slate-800">{cand.name}</span>
                  <span className="type-label shrink-0 text-green-700">{t.link}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search and link new entity */}
      <section className="flex flex-col gap-1.5">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="type-body w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-8 text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none"
          />
          {searching && (
            <Loader2 className="absolute right-3 size-4 animate-spin text-slate-400" />
          )}
        </div>

        {query.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <p className="type-meta py-1 text-center text-slate-400">{t.noResults}</p>
        )}

        {searchResults.length > 0 && (
          <ul className="max-h-48 flex flex-col gap-1 overflow-y-auto pt-1">
            {searchResults.map((result) => (
              <li key={`${result.entity_type}:${result.crm_id}`}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void onLink(result);
                    setQuery("");
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-green-300 hover:bg-green-50/50 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="type-body truncate font-medium text-slate-800">{result.name}</p>
                    <p className="type-meta text-slate-500">{entityLabel(result)}</p>
                  </div>
                  <span className="type-label text-green-700">{t.link}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
