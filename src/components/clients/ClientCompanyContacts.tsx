import React from "react";
import { Users, User, Phone, Mail, Plus, X, Link2, ExternalLink } from "lucide-react";
import type { Lead } from "../../types";
import { CustomSelect } from "../ui/CustomSelect";

interface ContactProfile {
  primaryId: string;
  name: string;
  clientType: "person" | "business" | "partner";
  companyClientId: string | null;
  contactRole: string | null;
  archived: boolean;
  phone: string;
  email: string;
  associatedLeads: Lead[];
}

interface ClientCompanyContactsProps {
  activeClient: ContactProfile;
  clientProfiles: ContactProfile[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  canEdit: boolean;
  t: (en: string, sk: string, hu: string) => string;
  setNewClientType: (value: "person" | "business" | "partner") => void;
  setNewClientCompanyClientId: (value: string) => void;
  setNewClientContactRole: (value: string) => void;
  setShowRegisterDrawer: (value: boolean) => void;
  attachExistingPersonId: string;
  setAttachExistingPersonId: (value: string) => void;
  attachExistingRole: string;
  setAttachExistingRole: (value: string) => void;
}

export const ClientCompanyContacts: React.FC<ClientCompanyContactsProps> = ({
  activeClient,
  clientProfiles,
  setLeads,
  canEdit,
  t,
  setNewClientType,
  setNewClientCompanyClientId,
  setNewClientContactRole,
  setShowRegisterDrawer,
  attachExistingPersonId,
  setAttachExistingPersonId,
  attachExistingRole,
  setAttachExistingRole,
}) => {
                const companyIdSet = new Set(activeClient.associatedLeads.map((l: Lead) => l.id));
                const attachedContacts = clientProfiles.filter(
                  c => c.clientType === "person" && !!c.companyClientId && companyIdSet.has(c.companyClientId)
                );
                const attachablePersons = clientProfiles.filter(
                  c => c.clientType === "person" && !c.archived && (!c.companyClientId || !companyIdSet.has(c.companyClientId))
                );
                const linkPersonToCompany = (personName: string, companyId: string | null, role?: string) => {
                  setLeads(prev => prev.map(l => {
                    if (l.name.trim().toLowerCase() !== personName.trim().toLowerCase()) return l;
                    return {
                      ...l,
                      companyClientId: companyId,
                      contactRole: companyId ? ((role ?? l.contactRole) || null) : null,
                    };
                  }));
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
                            "Client-side HR, dispatch, and billing contacts at this company.",
                            "Kontaktné osoby klienta (HR, majstri, fakturácia) v tejto firme.",
                            "Az ügyféloldali HR, üzemi és számlázási kapcsolattartók."
                          )}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewClientType("person");
                            setNewClientCompanyClientId(activeClient.primaryId);
                            setNewClientContactRole("");
                            setShowRegisterDrawer(true);
                          }}
                          className="h-9 px-3 rounded-md bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Plus className="h-4 w-4" />
                          <span>{t("New contact person", "Nový kontakt", "Új kapcsolattartó")}</span>
                        </button>
                      )}
                    </div>

                    {canEdit && attachablePersons.length > 0 && (
                      <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-1 ws-md:grid-cols-12 gap-2.5 items-end">
                        <div className="ws-md:col-span-5 space-y-1">
                          <label className="type-overline text-gray-500">
                            {t("Attach existing person contact", "Priradiť existujúcu osobu", "Meglévő személy hozzárendelése")}
                          </label>
                          <CustomSelect
                            value={attachExistingPersonId}
                            onChange={setAttachExistingPersonId}
                            options={[
                              { value: "", label: t("Select person...", "Vyberte osobu...", "Válasszon személyt...") },
                              ...attachablePersons.map(p => ({ value: p.name, label: p.name })),
                            ]}
                          />
                        </div>
                        <div className="ws-md:col-span-4 space-y-1">
                          <label className="type-overline text-gray-500">
                            {t("Role", "Pozícia", "Szerepkör")}
                          </label>
                          <input
                            type="text"
                            value={attachExistingRole}
                            onChange={(e) => setAttachExistingRole(e.target.value)}
                            placeholder={t("e.g. HR Manager", "napr. HR manažér", "pl. HR vezető")}
                            className="w-full px-3 py-2 rounded-md bg-white border border-gray-300 text-ui font-medium focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                          />
                        </div>
                        <div className="ws-md:col-span-3">
                          <button
                            type="button"
                            disabled={!attachExistingPersonId}
                            onClick={() => {
                              if (!attachExistingPersonId) return;
                              linkPersonToCompany(attachExistingPersonId, activeClient.primaryId, attachExistingRole.trim());
                              setAttachExistingPersonId("");
                              setAttachExistingRole("");
                              (window as any).showToast?.(t("Contact attached to company", "Kontakt priradený k firme", "Kapcsolattartó hozzárendelve"));
                            }}
                            className="w-full h-10 px-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-ui font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
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
                        {attachedContacts.map(person => (
                          <div
                            key={person.primaryId}
                            className="p-4 rounded-lg border border-gray-200 bg-white hover:border-entity-border transition-all shadow-2xs flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    window.location.hash = `client-${encodeURIComponent(person.name)}`;
                                  }}
                                  className="font-heading font-semibold text-ui text-gray-900 hover:text-entity-text cursor-pointer flex items-center gap-1"
                                >
                                  <User className="h-3.5 w-3.5 text-entity-text" />
                                  <span>{person.name}</span>
                                </button>
                                {person.contactRole && (
                                  <span className="px-2 py-0.5 rounded-md type-overline bg-sky-50 text-sky-700 border border-sky-200">
                                    {person.contactRole}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-micro text-gray-500">
                                {person.phone && (
                                  <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-entity-text" /> {person.phone}</span>
                                )}
                                {person.email && (
                                  <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-entity-text" /> {person.email}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { window.location.hash = `client-${encodeURIComponent(person.name)}`; }}
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
                        ))}
                      </div>
                    )}
                  </div>
                );
};
