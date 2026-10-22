import React, { useState } from "react";
import { Check, RefreshCw, UserPlus, X } from "lucide-react";
import type { CompanyBillingSettings, Lead, UserProfile } from "../../types";
import type { Language } from "../../utils/translations";
import { CustomSelect } from "../ui/CustomSelect";
import { CompanyLookupSpinner, CompanySuggestions } from "../ui/CompanySuggestions";
import { useCompanyLookup } from "../../utils/useCompanyLookup";
import { applyCompanyDetailsToLead, registryCountryOf, EUROPEAN_COUNTRIES } from "../../utils/companyRegistry";
import type { CompanyBackedRecord, CompanyLookupField, CompanySuggestion } from "../../utils/companyRegistry";
import { todayLocal, nowLocalStamp } from "../../utils/localTime";
import { cn } from "../../utils/cn";
import { inputClass, labelClass } from "./styles";

/**
 * The client the editor can register on the spot — a Lead in the making.
 *
 * It extends `CompanyBackedRecord` so a picked register row goes through the
 * very same `applyCompanyDetailsToLead` the client register uses, and the
 * establishment date, legal form, SK NACE and the rest ride along into the new
 * client instead of being dropped on the way.
 */
interface NewClientDraft extends CompanyBackedRecord {
  clientType: Lead["clientType"];
  phone: string;
  email: string;
}

interface NewClientModalProps {
  lang: Language;
  systemLanguage?: string | null;
  canEdit: boolean;
  currentUser: UserProfile | null;
  companyBillingSettings?: CompanyBillingSettings | null;
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  onClose: () => void;
  /** The client has been saved to the register; the caller links it to its document. */
  onCreated: (client: Lead) => void;
}

/**
 * Nothing kills a quote faster than discovering the buyer is not in the CRM yet
 * and having to leave the document to put them there. This registers them
 * without leaving it: the record lands in the client register (status
 * "accepted"), never in the lead pipeline, and is linked to the draft at once.
 *
 * Rendered only while open, so every opening starts from an empty form.
 */
export const NewClientModal: React.FC<NewClientModalProps> = ({
  lang,
  systemLanguage,
  canEdit,
  currentUser,
  companyBillingSettings,
  setLeads,
  onClose,
  onCreated
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const toast = (message: string, variant?: "error" | "warning") => {
    const fn = (window as any).showToast;
    if (typeof fn === "function") fn(message, variant);
  };

  const [newClient, setNewClient] = useState<NewClientDraft>(() => ({
    clientType: "business",
    name: "",
    city: "",
    phone: "",
    email: "",
    contactPerson: "",
    companyId: "",
    taxId: "",
    vatId: "",
    address: {
      street: "",
      city: "",
      postalCode: "",
      country: companyBillingSettings?.country || "Slovakia"
    }
  }));

  const newClientCountry = newClient.address?.country || companyBillingSettings?.country || "Slovakia";

  const newClientLookup = useCompanyLookup<CompanyLookupField>({
    country: newClientCountry,
    // A private person has nothing to look up — the registers only hold subjects.
    enabled: newClient.clientType !== "person"
  });

  const patchNewClient = (patch: Partial<NewClientDraft>) => setNewClient(prev => ({ ...prev, ...patch }));

  const patchNewClientAddress = (patch: Partial<NewClientDraft["address"]>) =>
    setNewClient(prev => ({ ...prev, address: { ...(prev.address || {}), ...patch } }));

  /** Types into a register-backed field and asks the register about it. */
  const editNewClientField = (field: CompanyLookupField, value: string) => {
    patchNewClient({ [field]: value } as Partial<NewClientDraft>);
    newClientLookup.search(field, value, newClientCountry);
  };

  const handleNewClientSuggestion = async (item: CompanySuggestion) => {
    const details = await newClientLookup.select(item, newClientCountry);

    if (details) {
      setNewClient(prev => applyCompanyDetailsToLead(prev, details));
      toast(
        t("Client details loaded from the register.", "Údaje klienta boli načítané z registra.", "Az ügyfél adatai betöltve a cégjegyzékből.")
      );
      return;
    }

    // The register answered the search but not the detail call — keep what the
    // picked row already carried instead of dropping the choice.
    setNewClient(prev => ({
      ...prev,
      name: item.name || prev.name,
      companyId: item.companyId || prev.companyId,
      taxId: item.taxId || prev.taxId
    }));
    toast(
      t("Error loading company details.", "Chyba pri načítaní údajov z registra.", "Hiba a cégadatok betöltésekor."),
      "error"
    );
  };

  const close = () => {
    newClientLookup.close();
    onClose();
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const name = newClient.name.trim();
    if (!name) {
      toast(t("Client name is required.", "Meno klienta je povinné.", "Az ügyfél neve kötelező."), "error");
      return;
    }

    const isCompany = newClient.clientType !== "person";
    const city = (newClient.city || newClient.address?.city || "").trim();
    const orUndefined = (value?: string) => (isCompany && value?.trim() ? value.trim() : undefined);

    const client: Lead = {
      id: `client-${Date.now()}`,
      name,
      city,
      clientType: newClient.clientType,
      // "accepted" is what tells a client from an open lead everywhere in the
      // app — it keeps the record out of the pipeline and in the register.
      status: "accepted",
      source: "website",
      owner: currentUser?.name || "",
      value: 0,
      // `leads.created_at` is a DATE column: a full ISO timestamp makes MySQL
      // reject the whole sync payload.
      createdAt: todayLocal(),
      rating: 5,
      phone: newClient.phone.trim() || undefined,
      email: newClient.email.trim() || undefined,
      address: {
        street: (newClient.address?.street || "").trim(),
        city,
        postalCode: (newClient.address?.postalCode || "").trim(),
        country: newClientCountry
      },
      companyId: orUndefined(newClient.companyId),
      taxId: orUndefined(newClient.taxId),
      vatId: orUndefined(newClient.vatId),
      contactPerson: orUndefined(newClient.contactPerson),
      establishmentDate: orUndefined(newClient.establishmentDate),
      legalForm: orUndefined(newClient.legalForm),
      skNace: orUndefined(newClient.skNace),
      organizationSize: orUndefined(newClient.organizationSize),
      ownershipType: orUndefined(newClient.ownershipType),
      dataSource: orUndefined(newClient.dataSource),
      dissolutionDate: orUndefined(newClient.dissolutionDate),
      region: orUndefined(newClient.region),
      district: orUndefined(newClient.district),
      timeline: [
        {
          id: `ev-${Date.now()}`,
          type: "note",
          timestamp: nowLocalStamp(),
          title: t("Client Registered", "Klient zaregistrovaný", "Ügyfél regisztrálva"),
          content: t(
            "Client profile registered while preparing a price offer.",
            "Profil klienta bol zaregistrovaný pri príprave cenovej ponuky.",
            "Az ügyfélprofil árajánlat készítése közben lett regisztrálva."
          )
        }
      ]
    };

    setLeads(prev => [client, ...prev]);
    onCreated(client);
    close();
    toast(t("New client registered.", "Nový klient bol zaregistrovaný.", "Az új ügyfél regisztrálva."));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={handleCreateClient}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-start gap-4 bg-slate-50/70">
          <div className="min-w-0">
            <h3 className="text-title-sm font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <UserPlus className="h-4.5 w-4.5 text-indigo-600" />
              {t("Register a new client", "Registrovať nového klienta", "Új ügyfél regisztrálása")}
            </h3>
            <p className="text-caption text-slate-500 font-medium mt-1">
              {t(
                "Saved to the client register, not to the lead pipeline, and linked to this document straight away.",
                "Uloží sa do registra klientov, nie medzi leady, a hneď sa prepojí s týmto dokladom.",
                "Az ügyfélnyilvántartásba kerül, nem a leadek közé, és azonnal összekapcsolódik ezzel a bizonylattal."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            title={t("Close", "Zavrieť", "Bezárás")}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-all shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Client type */}
          <div>
            <label className={labelClass}>{t("Client type", "Typ klienta", "Ügyfél típusa")}</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "business" as const, label: t("Company", "Firma", "Cég") },
                { id: "person" as const, label: t("Person", "Fyzická osoba", "Magánszemély") },
                { id: "partner" as const, label: t("Partner", "Partner", "Partner") }
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    patchNewClient({ clientType: opt.id });
                    if (opt.id === "person") newClientLookup.close();
                  }}
                  className={cn(
                    "px-3 py-2 rounded-xl border-2 text-ui font-bold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.98]",
                    newClient.clientType === opt.id
                      ? "border-indigo-500 bg-indigo-50/60 text-indigo-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>{t("Country", "Krajina", "Ország")}</label>
              <CustomSelect
                value={newClientCountry}
                onChange={v => patchNewClientAddress({ country: v })}
                options={EUROPEAN_COUNTRIES.map(c => ({ value: c, label: c }))}
              />
            </div>
            <div className="ws-sm:col-span-2 relative">
              <label className={labelClass}>
                {t("Name / company *", "Meno / názov firmy *", "Név / cégnév *")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={newClient.name}
                  onChange={e => editNewClientField("name", e.target.value)}
                  placeholder={t("e.g. Ján Novák or Acme s.r.o.", "napr. Ján Novák alebo Acme s.r.o.", "pl. Kiss János vagy Acme Kft.")}
                  className={`${inputClass} pr-9`}
                />
                <CompanyLookupSpinner visible={newClientLookup.isLoading && newClientLookup.activeField === "name"} />
              </div>
              <CompanySuggestions
                suggestions={newClientLookup.suggestions}
                visible={newClientLookup.activeField === "name"}
                onSelect={handleNewClientSuggestion}
                onDismiss={newClientLookup.close}
                systemLanguage={systemLanguage}
              />
            </div>
          </div>

          {/* Register-backed identifiers — a private person has none. */}
          {newClient.clientType !== "person" && (
            <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3 animate-fade-in">
              {([
                { field: "companyId" as const, label: "IČO", placeholder: "12345678" },
                { field: "taxId" as const, label: "DIČ", placeholder: "2020123456" },
                { field: "vatId" as const, label: "IČ DPH", placeholder: "SK2020123456" }
              ]).map(f => (
                <div key={f.field} className="relative">
                  <label className={labelClass}>{f.label}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newClient[f.field] || ""}
                      onChange={e => editNewClientField(f.field, e.target.value)}
                      placeholder={f.placeholder}
                      className={`${inputClass} pr-9`}
                    />
                    <CompanyLookupSpinner
                      visible={newClientLookup.isLoading && newClientLookup.activeField === f.field}
                    />
                  </div>
                  <CompanySuggestions
                    suggestions={newClientLookup.suggestions}
                    visible={newClientLookup.activeField === f.field}
                    onSelect={handleNewClientSuggestion}
                    onDismiss={newClientLookup.close}
                    systemLanguage={systemLanguage}
                  />
                </div>
              ))}
            </div>
          )}

          {registryCountryOf(newClientCountry) && newClient.clientType !== "person" && (
            <p className="text-micro text-slate-400 font-medium -mt-1">
              {t(
                "Start typing a name or IČO — the business register fills in the address and identifiers.",
                "Začnite písať názov alebo IČO — obchodný register doplní adresu aj identifikátory.",
                "Kezdje el gépelni a nevet vagy az adószámot — a cégjegyzék kitölti a címet és az azonosítókat."
              )}
            </p>
          )}

          {newClient.clientType !== "person" && (
            <div>
              <label className={labelClass}>{t("Contact person", "Kontaktná osoba", "Kapcsolattartó")}</label>
              <input
                type="text"
                value={newClient.contactPerson || ""}
                onChange={e => patchNewClient({ contactPerson: e.target.value })}
                className={inputClass}
              />
            </div>
          )}

          <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("Email", "Email", "E-mail")}</label>
              <input
                type="email"
                value={newClient.email}
                onChange={e => patchNewClient({ email: e.target.value })}
                placeholder="client@email.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("Phone", "Telefón", "Telefon")}</label>
              <input
                type="text"
                value={newClient.phone}
                onChange={e => patchNewClient({ phone: e.target.value })}
                placeholder="+421…"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 ws-sm:grid-cols-4 gap-3">
            <div className="ws-sm:col-span-2">
              <label className={labelClass}>{t("Street", "Ulica a číslo", "Utca, házszám")}</label>
              <input
                type="text"
                value={newClient.address?.street || ""}
                onChange={e => patchNewClientAddress({ street: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("City", "Mesto", "Város")}</label>
              <input
                type="text"
                value={newClient.city || newClient.address?.city || ""}
                onChange={e => {
                  patchNewClient({ city: e.target.value });
                  patchNewClientAddress({ city: e.target.value });
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("Postal code", "PSČ", "Irányítószám")}</label>
              <input
                type="text"
                value={newClient.address?.postalCode || ""}
                onChange={e => patchNewClientAddress({ postalCode: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2.5 rounded-xl text-ui font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer transition-all active:scale-[0.98]"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
          <button
            type="submit"
            disabled={!newClient.name.trim() || newClientLookup.isResolving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-bold shadow-md shadow-indigo-600/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {newClientLookup.isResolving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("Create & link client", "Vytvoriť a prepojiť klienta", "Ügyfél létrehozása és összekapcsolása")}
          </button>
        </div>
      </form>
    </div>
  );
};
