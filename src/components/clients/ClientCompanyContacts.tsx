import React, { useState } from "react";
import { Users, User, Phone, Mail, Plus, X, Link2, ExternalLink, PencilLine, Check } from "lucide-react";
import type { Lead } from "../../types";
import { CustomSelect } from "../ui/CustomSelect";
import { ContactTagInput } from "./ContactTagInput";
import { contactTagsSummary, normalizeContactTags, resolveContactTags } from "../../utils/contactTags";
import { contactNamePatch, contactNameShown } from "../../utils/contactName";
import { todayLocal, nowLocalStamp } from "../../utils/localTime";

interface ContactProfile {
  primaryId: string;
  name: string;
  clientType: "person" | "business" | "partner";
  companyClientId: string | null;
  contactRole: string | null;
  contactTags: string[];
  archived: boolean;
  phone: string;
  email: string;
  associatedLeads: Lead[];
}

interface ClientCompanyContactsProps {
  activeClient: ContactProfile;
  clientProfiles: ContactProfile[];
  allContactTags: string[];
  defaultOwner: string;
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  canEdit: boolean;
  t: (en: string, sk: string, hu: string) => string;
  attachExistingPersonId: string;
  setAttachExistingPersonId: (value: string) => void;
  attachExistingTags: string[];
  setAttachExistingTags: (value: string[]) => void;
}

export const ClientCompanyContacts: React.FC<ClientCompanyContactsProps> = ({
  activeClient,
  clientProfiles,
  allContactTags,
  defaultOwner,
  setLeads,
  canEdit,
  t,
  attachExistingPersonId,
  setAttachExistingPersonId,
  attachExistingTags,
  setAttachExistingTags,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);

  const [editingPersonKey, setEditingPersonKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  const companyIdSet = new Set(activeClient.associatedLeads.map((l: Lead) => l.id));
  const companyNameById = new Map<string, string>();
  for (const c of clientProfiles) {
    if (c.clientType === "person") continue;
    companyNameById.set(c.primaryId, c.name);
    for (const l of c.associatedLeads) {
      if (l.id) companyNameById.set(l.id, c.name);
    }
  }
  const attachedContacts = clientProfiles.filter(
    (c) => c.clientType === "person" && !!c.companyClientId && companyIdSet.has(c.companyClientId)
  );
  const attachablePersons = clientProfiles.filter(
    (c) => c.clientType === "person" && !c.archived && (!c.companyClientId || !companyIdSet.has(c.companyClientId))
  );

  const linkPersonToCompany = (personName: string, companyId: string | null, tags?: string[]) => {
    const cleanTags = tags !== undefined ? normalizeContactTags(tags) : undefined;
    setLeads((prev) =>
      prev.map((l) => {
        if (l.name.trim().toLowerCase() !== personName.trim().toLowerCase()) return l;
        const nextTags = companyId ? (cleanTags ?? resolveContactTags(l.contactTags, l.contactRole)) : [];
        return {
          ...l,
          companyClientId: companyId,
          contactTags: nextTags,
          contactRole: companyId ? contactTagsSummary(nextTags) : null,
        };
      })
    );
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = addName.trim();
    if (!cleanName) {
      (window as any).showToast?.(t("Contact name is required", "Meno kontaktu je povinné", "A kapcsolattartó neve kötelező"), "error");
      return;
    }
    const cleanTags = normalizeContactTags(addTags);
    const nameParts = contactNameShown({ firstName: "", lastName: "" }, cleanName, true);
    const newLead: Lead = {
      id: `client-${Date.now()}`,
      name: cleanName,
      city: "",
      clientType: "person",
      status: "accepted",
      source: "website",
      owner: defaultOwner,
      value: 0,
      adjustment: 0,
      createdAt: todayLocal(),
      rating: 5,
      phone: addPhone.trim() || undefined,
      email: addEmail.trim() || undefined,
      companyClientId: activeClient.primaryId,
      contactTags: cleanTags,
      contactRole: contactTagsSummary(cleanTags),
      ...contactNamePatch(null, nameParts, true),
      timeline: [
        {
          id: `ev-${Date.now()}`,
          type: "note",
          timestamp: nowLocalStamp(),
          title: t("Contact Added", "Kontakt pridaný", "Kapcsolattartó hozzáadva"),
          content: t(
            `Added as contact for ${activeClient.name}.`,
            `Pridaný ako kontakt pre ${activeClient.name}.`,
            `Hozzáadva kapcsolattartóként ehhez a céghez: ${activeClient.name}.`
          ),
        },
      ],
    };
    setLeads((prev) => [newLead, ...prev]);
    setAddName("");
    setAddPhone("");
    setAddEmail("");
    setAddTags([]);
    setShowAddForm(false);
    (window as any).showToast?.(t("Contact added to company", "Kontakt pridaný k firme", "Kapcsolattartó hozzáadva a céghez"));
  };

  const startEdit = (person: ContactProfile) => {
    setEditingPersonKey(person.primaryId);
    setEditName(person.name);
    setEditPhone(person.phone || "");
    setEditEmail(person.email || "");
    setEditTags(resolveContactTags(person.contactTags, person.contactRole));
  };

  const saveEdit = (person: ContactProfile) => {
    const cleanName = editName.trim();
    if (!cleanName) {
      (window as any).showToast?.(t("Contact name is required", "Meno kontaktu je povinné", "A kapcsolattartó neve kötelező"), "error");
      return;
    }
    const cleanTags = normalizeContactTags(editTags);
    const idSet = new Set(person.associatedLeads.map((l) => l.id));
    setLeads((prev) =>
      prev.map((l) => {
        if (!idSet.has(l.id)) return l;
        return {
          ...l,
          name: cleanName,
          phone: editPhone.trim() || undefined,
          email: editEmail.trim() || undefined,
          contactTags: cleanTags,
          contactRole: contactTagsSummary(cleanTags),
          ...contactNamePatch(l, { firstName: l.contactFirstName || "", lastName: l.contactLastName || "" }, true, cleanName),
        };
      })
    );
    setEditingPersonKey(null);
    (window as any).showToast?.(t("Contact updated", "Kontakt aktualizovaný", "Kapcsolattartó frissítve"));
  };

  return (
    <div className="space-y-4 text-left" data-testid="company-attached-contacts">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <h3 className="text-ui font-semibold text-gray-800 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-entity-text" />
            {t("Company Contact Persons", "Kontaktné osoby firmy", "Céges kapcsolattartók")}
          </h3>
          <p className="text-micro text-gray-500 mt-0.5">
            {t(
              "Client-side contacts (CEO, HR, billing, operations) with function tags.",
              "Kontaktné osoby klienta (konateľ, HR, fakturácia, prevádzka) so štítkami funkcií.",
              "Az ügyféloldali kapcsolattartók (ügyvezető, HR, számlázás, üzem) funkció címkékkel."
            )}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {attachablePersons.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowAttachForm((prev) => !prev);
                  setShowAddForm(false);
                }}
                className="h-9 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-ui font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                {showAttachForm ? <X className="h-4 w-4" /> : <Link2 className="h-4 w-4 text-entity-text" />}
                <span>{showAttachForm ? t("Cancel", "Zrušiť", "Mégse") : t("Attach existing", "Priradiť existujúceho", "Meglévő hozzárendelése")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setShowAttachForm(false);
              }}
              className="h-9 px-3 rounded-md bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{showAddForm ? t("Cancel", "Zrušiť", "Mégse") : t("New contact person", "Nový kontakt", "Új kapcsolattartó")}</span>
            </button>
          </div>
        )}
      </div>

      {canEdit && showAddForm && (
        <form onSubmit={handleQuickAdd} className="p-4 rounded-lg bg-sky-50/50 border border-sky-200 space-y-3">
          <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="type-overline text-gray-600">{t("Name", "Meno", "Név")} *</label>
              <input
                type="text"
                required
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t("e.g. Jana Nováková", "napr. Jana Nováková", "pl. Kovács Anna")}
                className="w-full h-10 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-gray-600">{t("Phone", "Telefón", "Telefon")}</label>
              <input
                type="text"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="+421 900 000 000"
                className="w-full h-10 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-gray-600">{t("Email", "E-mail", "E-mail")}</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="jana@company.sk"
                className="w-full h-10 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
              />
            </div>
          </div>
          <div className="flex flex-col ws-md:flex-row gap-2.5 items-stretch ws-md:items-end">
            <div className="flex-1 space-y-1">
              <label className="type-overline text-gray-600">{t("Function tags", "Funkčné štítky", "Funkció címkék")}</label>
              <ContactTagInput
                value={addTags}
                onChange={setAddTags}
                suggestions={allContactTags}
                placeholder={t("Add tags (Enter or ,), e.g. CEO, Billing", "Pridať štítky (Enter alebo ,), napr. CEO, Fakturácia", "Címkék hozzáadása (Enter vagy ,), pl. Ügyvezető, Számlázás")}
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-md bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
            >
              <Check className="h-4 w-4" />
              <span>{t("Save contact", "Uložiť kontakt", "Kapcsolattartó mentése")}</span>
            </button>
          </div>
        </form>
      )}

      {canEdit && showAttachForm && attachablePersons.length > 0 && (
        <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-1 ws-md:grid-cols-12 gap-2.5 items-end">
          <div className="ws-md:col-span-4 space-y-1">
            <label className="type-overline text-gray-500">
              {t("Attach existing person contact", "Priradiť existujúcu osobu", "Meglévő személy hozzárendelése")}
            </label>
            <CustomSelect
              value={attachExistingPersonId}
              onChange={setAttachExistingPersonId}
              options={[
                { value: "", label: t("Select person...", "Vyberte osobu...", "Válasszon személyt...") },
                ...attachablePersons.map((p) => {
                  const compName = p.companyClientId ? companyNameById.get(p.companyClientId) : undefined;
                  return {
                    value: p.name,
                    searchText: compName ? `${p.name} ${compName}` : p.name,
                    label: (
                      <span className="flex items-center justify-between gap-2 min-w-0 w-full">
                        <span className="truncate">{p.name}</span>
                        {compName && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 text-micro font-medium truncate max-w-40">
                            {compName}
                          </span>
                        )}
                      </span>
                    ),
                  };
                }),
              ]}
            />
          </div>
          <div className="ws-md:col-span-5 space-y-1">
            <label className="type-overline text-gray-500">
              {t("Function tags", "Funkčné štítky", "Funkció címkék")}
            </label>
            <ContactTagInput
              value={attachExistingTags}
              onChange={setAttachExistingTags}
              suggestions={allContactTags}
              placeholder={t("e.g. HR, Billing", "napr. HR, Fakturácia", "pl. HR, Számlázás")}
            />
          </div>
          <div className="ws-md:col-span-3">
            <button
              type="button"
              disabled={!attachExistingPersonId}
              onClick={() => {
                if (!attachExistingPersonId) return;
                linkPersonToCompany(attachExistingPersonId, activeClient.primaryId, attachExistingTags);
                setAttachExistingPersonId("");
                setAttachExistingTags([]);
                setShowAttachForm(false);
                (window as any).showToast?.(t("Contact attached to company", "Kontakt priradený k firme", "Kapcsolattartó hozzárendelve"));
              }}
              className="w-full h-10 px-3 rounded-md bg-entity-solid hover:bg-entity-solid-hover disabled:bg-gray-300 text-white text-ui font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed transition-all"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>{t("Attach", "Priradiť", "Csatolás")}</span>
            </button>
          </div>
        </div>
      )}

      {attachedContacts.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-ui font-medium rounded-lg border border-dashed border-gray-300 bg-gray-50">
          {t("No contacts attached to this company yet.", "K tejto firme zatiaľ nie sú priradené žiadne kontakty.", "Még nincsenek kapcsolattartók ehhez a céghez rendelve.")}
        </div>
      ) : (
        <div className="space-y-2.5">
          {attachedContacts.map((person) => {
            const tags = resolveContactTags(person.contactTags, person.contactRole);
            const isEditing = editingPersonKey === person.primaryId;

            if (isEditing && canEdit) {
              return (
                <div key={person.primaryId} className="p-4 rounded-lg border border-entity-border bg-entity-subtle/20 space-y-3 shadow-2xs">
                  <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="type-overline text-gray-600">{t("Name", "Meno", "Név")} *</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full h-9 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="type-overline text-gray-600">{t("Phone", "Telefón", "Telefon")}</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full h-9 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="type-overline text-gray-600">{t("Email", "E-mail", "E-mail")}</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full h-9 px-3 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="type-overline text-gray-600">{t("Function tags", "Funkčné štítky", "Funkció címkék")}</label>
                    <ContactTagInput
                      value={editTags}
                      onChange={setEditTags}
                      suggestions={allContactTags}
                      placeholder={t("Add tags...", "Pridať štítky...", "Címkék hozzáadása...")}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPersonKey(null)}
                      className="h-8 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-ui font-semibold text-gray-700 cursor-pointer"
                    >
                      {t("Cancel", "Zrušiť", "Mégse")}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(person)}
                      className="h-8 px-3 rounded-md bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{t("Save", "Uložiť", "Mentés")}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={person.primaryId}
                className="p-4 rounded-lg border border-gray-200 bg-white hover:border-entity-border transition-all shadow-2xs flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `client-${encodeURIComponent(person.name)}`;
                      }}
                      className="font-heading font-semibold text-ui text-gray-900 hover:text-entity-text cursor-pointer flex items-center gap-1 mr-1"
                    >
                      <User className="h-3.5 w-3.5 text-entity-text" />
                      <span>{person.name}</span>
                    </button>
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md type-overline bg-sky-50 text-sky-700 border border-sky-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-micro text-gray-500">
                    {person.phone && (
                      <a href={`tel:${person.phone}`} className="flex items-center gap-1 hover:text-gray-800">
                        <Phone className="h-3 w-3 text-entity-text" /> {person.phone}
                      </a>
                    )}
                    {person.email && (
                      <a href={`mailto:${person.email}`} className="flex items-center gap-1 hover:text-gray-800">
                        <Mail className="h-3 w-3 text-entity-text" /> {person.email}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => startEdit(person)}
                      className="h-8 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-ui font-semibold text-gray-700 shadow-2xs cursor-pointer flex items-center gap-1"
                      title={t("Edit contact", "Upraviť kontakt", "Kapcsolattartó szerkesztése")}
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      <span>{t("Edit", "Upraviť", "Szerkesztés")}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = `client-${encodeURIComponent(person.name)}`;
                    }}
                    className="h-8 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-ui font-semibold text-gray-700 shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{t("Open", "Otvoriť", "Megnyitás")}</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => linkPersonToCompany(person.name, null)}
                      className="h-8 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-ui font-semibold text-rose-700 cursor-pointer"
                      title={t("Unlink from company", "Odobrať z firmy", "Leválasztás a cégről")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
