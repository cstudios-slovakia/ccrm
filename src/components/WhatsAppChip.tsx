import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Users, User as UserIcon, ChevronDown } from "lucide-react";
import type { Language } from "../utils/translations";
import { useWhatsAppLinks } from "../hooks/useWhatsAppLinks";
import {
  chatHref,
  isOwnChat,
  linksForLead,
  linksForProject,
  orderLinks,
  resolveWhatsAppState,
  startChatHref,
  type ProjectLinkInput,
} from "../utils/whatsappLinks";
import type { LeadLike } from "../utils/leadClient";
import type { Task } from "../types";

interface BaseProps {
  userLanguage: Language;
  leads: LeadLike[];
  className?: string;
}

interface LeadProps extends BaseProps {
  lead: LeadLike & { id: string; address?: { country?: string } | null; country?: string | null };
  project?: undefined;
  contactLeadIds?: undefined;
}

interface ProjectProps extends BaseProps {
  project: ProjectLinkInput;
  /** Leads named by the project's contact attributes; their chats count as the project's. */
  contactLeadIds?: string[];
  lead?: undefined;
}

export type WhatsAppChipProps = LeadProps | ProjectProps;

const tr = (lang: Language, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

/**
 * The WhatsApp action next to a phone number: open the paired chat, pick one of several, or start a new one.
 * Renders nothing when there is nothing to offer (no chats, no usable number, or no permission to see chats).
 */
export function WhatsAppChip(props: WhatsAppChipProps) {
  const { userLanguage: lang, leads, className = "" } = props;
  const { links, numbers, viewerId } = useWhatsAppLinks();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const { chats, rawPhone, country, target } = useMemo(() => {
    if (props.lead) {
      const lead = props.lead;
      return {
        chats: orderLinks(linksForLead(lead.id, links, leads), viewerId),
        rawPhone: lead.phone,
        country: lead.address?.country ?? lead.country ?? null,
        target: { leadId: lead.id },
      };
    }
    const project = props.project;
    const owner = leads.find((l) => l.id === (project.leadId ?? project.clientId)) as
      | (LeadLike & { address?: { country?: string } | null; country?: string | null })
      | undefined;
    return {
      chats: orderLinks(linksForProject(project, links, leads, props.contactLeadIds), viewerId),
      rawPhone: project.contactPhone,
      country: owner?.address?.country ?? owner?.country ?? null,
      target: { projectId: project.id, leadId: project.leadId ?? project.clientId ?? null },
    };
  }, [props.lead, props.project, props.contactLeadIds, links, leads, viewerId]);

  const { state, phone } = resolveWhatsAppState(chats, rawPhone, country, numbers);

  // The menu is fixed to the viewport (portal) so a drawer or a scrolling table cannot clip it.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const width = 288;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el) || buttonRef.current?.contains(el)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (state === "none") return null;

  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-bold transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";
  const tone =
    state === "chat"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700";

  if (state === "start") {
    return (
      <a
        href={startChatHref(phone!, target)}
        className={`${base} ${tone} ${className}`}
        title={tr(lang, "Open WhatsApp and start a chat with this number", "Otvoriť WhatsApp a začať chat s týmto číslom", "A WhatsApp megnyitása és csevegés indítása ezzel a számmal")}
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className="h-3 w-3" />
        {tr(lang, "Start chat", "Začať chat", "Csevegés indítása")}
      </a>
    );
  }

  if (chats.length === 1) {
    const chat = chats[0];
    const own = isOwnChat(chat, viewerId);
    return (
      <a
        href={chatHref(chat.path)}
        className={`${base} ${tone} ${own ? "" : "opacity-80"} ${className}`}
        title={own ? chat.title : `${chat.title} · ${tr(lang, "belongs to another user", "patrí inému používateľovi", "másik felhasználóé")}`}
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className="h-3 w-3" />
        {tr(lang, "Open chat", "Otvoriť chat", "Csevegés megnyitása")}
      </a>
    );
  }

  const locale = lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-US";
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${base} ${tone} ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MessageCircle className="h-3 w-3" />
        {tr(lang, `${chats.length} chats`, `${chats.length} chaty`, `${chats.length} csevegés`)}
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[100001] w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {chats.map((chat) => {
            const own = isOwnChat(chat, viewerId);
            const when = chat.lastMessageAt ? new Date(chat.lastMessageAt.replace(" ", "T")) : null;
            return (
              <a
                key={chat.conversationRef}
                role="menuitem"
                href={chatHref(chat.path)}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-emerald-50 ${own ? "" : "opacity-70"}`}
              >
                {chat.isGroup ? <Users className="h-4 w-4 shrink-0 text-slate-400" /> : <UserIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-bold text-slate-800">{chat.title || chat.conversationRef}</span>
                  <span className="block truncate text-caption text-slate-500">
                    {chat.isGroup ? tr(lang, "Group", "Skupina", "Csoport") : tr(lang, "Chat", "Chat", "Csevegés")}
                    {when && !Number.isNaN(when.getTime()) ? ` · ${when.toLocaleDateString(locale, { day: "numeric", month: "short" })}` : ""}
                    {own ? "" : ` · ${tr(lang, "another user's", "iného používateľa", "másik felhasználóé")}`}
                  </span>
                </span>
              </a>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/** "Open in chat" on a timeline entry or task that WAAI pushed in: a deep link into the WhatsApp module. */
export function OpenInChatLink({ path, userLanguage: lang, className = "" }: { path: string; userLanguage: Language; className?: string }) {
  return (
    <a
      href={chatHref(path)}
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-caption font-bold text-green-700 transition-all duration-150 hover:bg-green-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${className}`}
    >
      <MessageCircle className="h-3 w-3" />
      {tr(lang, "Open in chat", "Otvoriť v chate", "Megnyitás a csevegésben")}
    </a>
  );
}

/**
 * Marks on a task WAAI pushed in from a chat: a WhatsApp badge, an "Open in chat" link and, while nobody has
 * moved the date, a note that the chat gave no deadline. Renders nothing for any other task.
 */
export function TaskWhatsAppMarks({
  task,
  userLanguage: lang,
  showNote = true,
}: {
  task: Pick<Task, "externalSource" | "externalUrl" | "dueInferred">;
  userLanguage: Language;
  showNote?: boolean;
}) {
  if (task.externalSource !== "waai") return null;
  return (
    <>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-micro font-bold text-green-700"
        title={tr(lang, "Created from a WhatsApp chat", "Vytvorené z WhatsApp chatu", "WhatsApp-csevegésből létrehozva")}
      >
        <MessageCircle className="h-2.5 w-2.5" />
        WhatsApp
      </span>
      {showNote && task.dueInferred && (
        <span className="shrink-0 text-micro font-semibold italic text-slate-400">
          {tr(lang, "deadline not stated in chat", "termín nebol uvedený v chate", "a határidőt a csevegés nem tartalmazta")}
        </span>
      )}
      {task.externalUrl && (
        <a
          href={chatHref(task.externalUrl)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-green-200 bg-white px-1.5 py-0.5 text-micro font-bold text-green-700 transition-all duration-150 hover:bg-green-50 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {tr(lang, "Open in chat", "Otvoriť v chate", "Megnyitás a csevegésben")}
        </a>
      )}
    </>
  );
}
