import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Handshake, User, UserPlus, X } from "lucide-react";
import type { Lead, UserProfile } from "../../types";
import { todayLocal, nowLocalStamp } from "../../utils/localTime";
import { getStoredLanguage } from "../../utils/translations";

/**
 * "Add a new one" for every lead / client picker in the app.
 *
 * The pickers live in drawers, modals and side cards that have no business
 * owning the lead list, so the form is mounted once at the top of the tree and
 * reached through this context. A picker asks for a record, the provider
 * creates it and hands it back, and the picker selects it — nobody navigates
 * away from the half-filled form they were in.
 */

/** Which kind of record the picker is about — it only decides the default. */
export type QuickAddKind = "client" | "lead";

export interface QuickAddClientApi {
  /** Whether the current user may create leads/clients at all. */
  enabled: boolean;
  /** Opens the form; `onCreated` fires with the saved record. */
  open: (onCreated?: (lead: Lead) => void, kind?: QuickAddKind) => void;
}

const QuickAddClientContext = createContext<QuickAddClientApi>({
  enabled: false,
  open: () => {},
});

export const useQuickAddClient = (): QuickAddClientApi => useContext(QuickAddClientContext);

const COPY = {
  en: {
    title: "New lead / client",
    subtitle: "Saved straight into the register and picked for you.",
    kindLead: "Lead",
    kindClient: "Client",
    type: "Type",
    person: "Private person",
    business: "Company",
    partner: "Partner",
    name: "Name",
    namePlaceholder: "Company or person name",
    city: "City",
    phone: "Phone",
    email: "E-mail",
    cancel: "Cancel",
    save: "Create",
    nameRequired: "A name is required.",
    created: "New record created and selected.",
    timeline: "Created from a picker elsewhere in the app.",
    timelineTitle: "Record created",
  },
  sk: {
    title: "Nový lead / klient",
    subtitle: "Uloží sa priamo do registra a rovno sa vyberie.",
    kindLead: "Lead",
    kindClient: "Klient",
    type: "Typ",
    person: "Súkromná osoba",
    business: "Firma",
    partner: "Partner",
    name: "Meno",
    namePlaceholder: "Názov firmy alebo meno osoby",
    city: "Mesto",
    phone: "Telefón",
    email: "E-mail",
    cancel: "Zrušiť",
    save: "Vytvoriť",
    nameRequired: "Meno je povinné.",
    created: "Nový záznam bol vytvorený a vybraný.",
    timeline: "Vytvorené z výberu inde v aplikácii.",
    timelineTitle: "Záznam vytvorený",
  },
  hu: {
    title: "Új lead / ügyfél",
    subtitle: "Egyből a nyilvántartásba kerül és kiválasztjuk.",
    kindLead: "Lead",
    kindClient: "Ügyfél",
    type: "Típus",
    person: "Magánszemély",
    business: "Cég",
    partner: "Partner",
    name: "Név",
    namePlaceholder: "Cég vagy személy neve",
    city: "Város",
    phone: "Telefon",
    email: "E-mail",
    cancel: "Mégse",
    save: "Létrehozás",
    nameRequired: "A név kötelező.",
    created: "Az új rekord létrejött és ki van választva.",
    timeline: "Az alkalmazás egy másik választójából létrehozva.",
    timelineTitle: "Rekord létrehozva",
  },
} as const;

interface ProviderProps {
  setLeads: (updater: Lead[] | ((prev: Lead[]) => Lead[])) => void;
  currentUser: UserProfile | null;
  /** Pipeline order — a new lead starts at the first state. */
  leadStates: string[];
  leadSources: string[];
  /** Off, the pickers simply show no add button. */
  canCreate: boolean;
  children: React.ReactNode;
}

const emptyForm = () => ({
  name: "",
  city: "",
  phone: "",
  email: "",
  clientType: "person" as Lead["clientType"],
});

export const QuickAddClientProvider: React.FC<ProviderProps> = ({
  setLeads,
  currentUser,
  leadStates,
  leadSources,
  canCreate,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<QuickAddKind>("client");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const callbackRef = useRef<((lead: Lead) => void) | undefined>(undefined);
  const nameRef = useRef<HTMLInputElement>(null);
  const copy = COPY[getStoredLanguage()];

  const open = (onCreated?: (lead: Lead) => void, nextKind: QuickAddKind = "client") => {
    if (!canCreate) return;
    callbackRef.current = onCreated;
    setKind(nextKind);
    setForm(emptyForm());
    setError("");
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    callbackRef.current = undefined;
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => nameRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError(copy.nameRequired);
      nameRef.current?.focus();
      return;
    }
    const city = form.city.trim();
    const lead: Lead = {
      id: `${kind === "client" ? "client" : "lead"}-${Date.now()}`,
      name,
      city,
      clientType: form.clientType,
      // "accepted" is what tells a client from an open lead everywhere in the
      // app — it keeps the record out of the pipeline and in the register.
      status: kind === "client" ? "accepted" : leadStates[0] || "new",
      source: leadSources[0] || "website",
      owner: currentUser?.name || "",
      value: 0,
      // `leads.created_at` is a DATE column: a full ISO timestamp makes MySQL
      // reject the whole sync payload.
      createdAt: todayLocal(),
      rating: 5,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: city ? { street: "", city, postalCode: "", country: "" } : undefined,
      timeline: [
        {
          id: `ev-${Date.now()}`,
          type: "note",
          timestamp: nowLocalStamp(),
          title: copy.timelineTitle,
          content: copy.timeline,
        },
      ],
    };

    setLeads(prev => [lead, ...prev]);
    callbackRef.current?.(lead);
    close();
    (window as any).showToast?.(copy.created);
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";
  const labelClass = "block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1";

  const types: { id: Lead["clientType"]; label: string; icon: React.ReactNode }[] = [
    { id: "person", label: copy.person, icon: <User className="h-3.5 w-3.5" /> },
    { id: "business", label: copy.business, icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: "partner", label: copy.partner, icon: <Handshake className="h-3.5 w-3.5" /> },
  ];

  return (
    <QuickAddClientContext.Provider value={{ enabled: canCreate, open }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              // Above the select panels (100001) — this form is what one of them opened.
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[100010] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                onMouseDown={e => {
                  if (e.target === e.currentTarget) close();
                }}
              >
                <motion.form
                  initial={{ opacity: 0, scale: 0.97, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onSubmit={submit}
                  onMouseDown={e => e.stopPropagation()}
                  className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <UserPlus className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-heading font-black text-slate-900 truncate">{copy.title}</h3>
                        <p className="text-[11px] font-semibold text-slate-400 leading-snug">{copy.subtitle}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3.5 p-5">
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                      {(["lead", "client"] as QuickAddKind[]).map(k => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setKind(k)}
                          className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            kind === k ? "bg-white text-accent shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {k === "lead" ? copy.kindLead : copy.kindClient}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className={labelClass}>{copy.name} *</label>
                      <input
                        ref={nameRef}
                        value={form.name}
                        onChange={e => {
                          setForm(f => ({ ...f, name: e.target.value }));
                          if (error) setError("");
                        }}
                        maxLength={200}
                        placeholder={copy.namePlaceholder}
                        className={inputClass}
                      />
                      {error && <p className="mt-1 text-[10px] font-bold text-rose-600">{error}</p>}
                    </div>

                    <div>
                      <label className={labelClass}>{copy.type}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {types.map(tp => (
                          <button
                            key={tp.id}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, clientType: tp.id }))}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                              form.clientType === tp.id
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {tp.icon}
                            {tp.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>{copy.city}</label>
                        <input
                          value={form.city}
                          onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{copy.phone}</label>
                        <input
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>{copy.email}</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-xl px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    >
                      {copy.cancel}
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-sm transition-all hover:brightness-110 active:scale-95 cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {copy.save}
                    </button>
                  </div>
                </motion.form>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </QuickAddClientContext.Provider>
  );
};

export default QuickAddClientProvider;
