import { PRODUCT_NAME } from "../../utils/brand";
import { X } from "lucide-react";
import { CustomSelect } from "../ui/CustomSelect";
import React from "react";

interface EmailClientSlideoutProps {
  isClosingClient: boolean;
  closeClientSlideout: () => void;
  t: (en: string, sk: string, hu: string) => string;
  pendingChatLinkKey: string;
  handleCreateClientSubmit: (e: React.FormEvent) => void;
  clientFormName: string;
  setClientFormName: React.Dispatch<React.SetStateAction<string>>;
  clientFormEmail: string;
  setClientFormEmail: React.Dispatch<React.SetStateAction<string>>;
  clientFormPhone: string;
  setClientFormPhone: React.Dispatch<React.SetStateAction<string>>;
  clientFormCity: string;
  setClientFormCity: React.Dispatch<React.SetStateAction<string>>;
  clientFormType: "person" | "business" | "partner";
  setClientFormType: React.Dispatch<React.SetStateAction<"person" | "business" | "partner">>;
}

export const EmailClientSlideout: React.FC<EmailClientSlideoutProps> = ({
  isClosingClient, closeClientSlideout, t, pendingChatLinkKey, handleCreateClientSubmit, clientFormName,
  setClientFormName, clientFormEmail, setClientFormEmail, clientFormPhone, setClientFormPhone, clientFormCity,
  setClientFormCity, clientFormType, setClientFormType,
}) => {
  return (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end justify-center ${isClosingClient ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="fixed inset-0 -z-10" onClick={closeClientSlideout} />
          
          <div className={`w-full max-w-5xl h-[70vh] bg-white rounded-t-[32px] border-t border-slate-200/80 shadow-2xl p-8 flex flex-col justify-between text-left ${isClosingClient ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <span className="type-overline text-pink-500">{t(`${PRODUCT_NAME} Client Registration`, `Registrácia klienta ${PRODUCT_NAME}`, `${PRODUCT_NAME} ügyfél regisztráció`)}</span>
                <h3 className="text-body font-heading font-bold">
                  {pendingChatLinkKey
                    ? t("Create New Client from Chat", "Vytvoriť nového klienta z chatu", "Új ügyfél létrehozása csevegésből")
                    : t("Create New Client from Email", "Vytvoriť nového klienta z e-mailu", "Új ügyfél létrehozása e-mailből")}
                </h3>
              </div>
              <button
                onClick={closeClientSlideout}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateClientSubmit} className="flex-1 flex flex-col justify-between text-ui font-bold text-slate-700 mt-6">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Client Name / Business Name", "Meno klienta / Názov firmy", "Ügyfél neve / Cégnév")}</label>
                    <input
                      type="text"
                      required
                      value={clientFormName}
                      onChange={(e) => setClientFormName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Email Address", "E-mailová adresa", "E-mail cím")}</label>
                    <input
                      type="email"
                      required={!pendingChatLinkKey}
                      value={clientFormEmail}
                      onChange={(e) => setClientFormEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Phone Number", "Telefónne číslo", "Telefonszám")}</label>
                    <input
                      type="tel"
                      value={clientFormPhone}
                      onChange={(e) => setClientFormPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("City", "Mesto", "Város")}</label>
                    <input
                      type="text"
                      required={!pendingChatLinkKey}
                      value={clientFormCity}
                      onChange={(e) => setClientFormCity(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Client Type", "Typ klienta", "Ügyfél típusa")}</label>
                    <CustomSelect
                      value={clientFormType}
                      onChange={(v) => setClientFormType(v as any)}
                      options={[
                        { value: "person", label: t("Person", "Osoba", "Személy") },
                        { value: "business", label: t("Business", "Firma", "Cég") },
                        { value: "partner", label: t("Partner", "Partner", "Partner") },
                      ]}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={closeClientSlideout}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-ui font-bold transition-all cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-ui font-bold transition-all shadow cursor-pointer"
                >
                  {t("Save & Match Client", "Uložiť a priradiť klienta", "Mentés és ügyfél párosítása")}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
};
