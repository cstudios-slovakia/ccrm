import { useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import type { ChatCrmEntity, ChatCrmLinks } from "../../api/contract.ts";
import { CrmLinkPicker } from "./CrmLinkPicker.tsx";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  conversationId: string;
  crmLinks: ChatCrmLinks;
  language?: string;
  onLink: (entity: ChatCrmEntity) => Promise<void>;
  onUnlink: (entity: ChatCrmEntity) => Promise<void>;
  onSearch: (query: string) => Promise<ChatCrmEntity[]>;
  searchResults: ChatCrmEntity[];
  searching: boolean;
  saving: boolean;
  onOpenRecord?: (kind: "lead" | "project", id: string) => void;
  className?: string;
}

export const CrmLinkChip = ({
  conversationId,
  crmLinks,
  language = "en",
  onLink,
  onUnlink,
  onSearch,
  searchResults,
  searching,
  saving,
  onOpenRecord,
  className = "",
}: Props) => {
  const t = getPanelI18n(language).crmLink;
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!crmLinks.supported) return null;

  const firstLink = crmLinks.links[0];
  const label = firstLink
    ? crmLinks.links.length > 1
      ? `${firstLink.name} +${crmLinks.links.length - 1}`
      : firstLink.name
    : t.none;

  const isAmbiguous = Boolean(crmLinks.ambiguous);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        aria-haspopup="dialog"
        title={isAmbiguous ? t.title : label}
        className={`type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-all duration-150 active:scale-[0.98] ${
          isAmbiguous && !firstLink
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : firstLink
              ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {isAmbiguous && !firstLink ? (
          <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
        ) : (
          <Link2 className="size-3.5 text-green-600" aria-hidden />
        )}
        <span className="max-w-44 truncate">{label}</span>
      </button>

      <CrmLinkPicker
        conversationId={conversationId}
        crmLinks={crmLinks}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        language={language}
        onLink={onLink}
        onUnlink={onUnlink}
        onSearch={onSearch}
        searchResults={searchResults}
        searching={searching}
        saving={saving}
        onOpenRecord={onOpenRecord}
      />
    </div>
  );
};
