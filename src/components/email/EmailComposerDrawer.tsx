import { X, Loader2, Send } from "lucide-react";
import React from "react";

interface EmailComposerDrawerProps {
  comp: any;
  t: (en: string, sk: string, hu: string) => string;
  closeComposer: (composerId: number) => void;
  setComposers: React.Dispatch<React.SetStateAction<any[]>>;
  handleSendEmail: (composer: any) => Promise<void>;
  isSending: boolean;
}

export const EmailComposerDrawer: React.FC<EmailComposerDrawerProps> = ({
  comp, t, closeComposer, setComposers, handleSendEmail, isSending,
}) => {
  return (
        <div key={comp.id} className={`fixed bottom-0 right-10 w-96 bg-white border-t border-x border-slate-300 rounded-t-2xl shadow-2xl z-50 flex flex-col ${comp.isClosing ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
          <div className="bg-slate-900 text-white p-3 rounded-t-2xl flex items-center justify-between">
            <span className="text-ui font-bold">{t("New Email", "Nový e-mail", "Új e-mail")}</span>
            <button
              onClick={() => closeComposer(comp.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-3 text-left">
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("To Address", "Adresa príjemcu", "Címzett címe")}</label>
              <input
                type="email"
                value={comp.to}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, to: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("Subject", "Predmet", "Tárgy")}</label>
              <input
                type="text"
                value={comp.subject}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, subject: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("Message Body", "Telo správy", "Üzenet törzse")}</label>
              <textarea
                rows={6}
                value={comp.body}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, body: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:bg-white resize-none"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => handleSendEmail(comp)}
                disabled={isSending}
                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-ui font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow"
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t("Send Email", "Odoslať e-mail", "E-mail küldése")}
              </button>
            </div>
          </div>
        </div>
  );
};
