import React, { useState } from "react";
import { X, Sparkles, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { Language } from "../utils/translations";
import type { UpdateEntry } from "../utils/updateNotes";
import { useUpdateFancybox } from "./ZoomableUpdateImage";
import { UpdateNoteBlocks } from "./UpdateNoteBlocks";

export type { UpdateEntry };

interface UpdateNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  updates: UpdateEntry[];
  systemLanguage: Language;
}

export const UpdateNotesModal: React.FC<UpdateNotesModalProps> = ({
  isOpen,
  onClose,
  updates,
  systemLanguage,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const activeUpdate = updates[activeIndex];
  useUpdateFancybox(contentRef, activeUpdate?.id);

  if (!isOpen || updates.length === 0) return null;

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "sk") return sk;
    if (systemLanguage === "hu") return hu;
    return en;
  };

  const handlePrev = () => {
    if (activeIndex < updates.length - 1) {
      setActiveIndex(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-3xl bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[85vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-title-sm text-slate-800 leading-tight">
                {t("Product Updates", "Novinky v systéme", "Termékfrissítések")}
              </h2>
              <p className="type-overline text-slate-400 mt-1">
                {t("Learn about new features", "Dozvedieť sa o nových funkciách", "Ismerje meg az új funkciókat")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-indigo-600 text-white type-overline">
                  v{activeUpdate.version}
                </span>
                <h3 className="font-heading font-extrabold text-title text-slate-800">
                  {activeUpdate.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 text-caption font-semibold text-slate-400 mt-1 select-none">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {new Date(activeUpdate.postDate).toLocaleDateString(
                    systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US",
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Matrix Content Rendering */}
          <UpdateNoteBlocks
            blocks={activeUpdate.contentMatrix}
            group={`update-${activeUpdate.id}`}
            language={systemLanguage}
          />
        </div>

        {/* Pager / Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between select-none shrink-0">
          <div className="type-overline text-slate-400">
            {t(
              `Update ${updates.length - activeIndex} of ${updates.length}`,
              `Aktualizácia ${updates.length - activeIndex} z ${updates.length}`,
              `${updates.length - activeIndex} / ${updates.length} frissítés`
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handlePrev}
              disabled={activeIndex === updates.length - 1}
              className={`p-2 rounded-xl border border-slate-200 flex items-center justify-center transition-all bg-white font-bold text-ui gap-1.5 shadow-xs cursor-pointer ${
                activeIndex === updates.length - 1 
                  ? "opacity-40 cursor-not-allowed border-slate-100" 
                  : "hover:border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              title={t("Older Update", "Staršia aktualizácia", "Régebbi frissítés")}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline type-overline">
                {t("Older", "Staršie", "Régebbi")}
              </span>
            </button>
            
            <button
              onClick={handleNext}
              disabled={activeIndex === 0}
              className={`p-2 rounded-xl border border-slate-200 flex items-center justify-center transition-all bg-white font-bold text-ui gap-1.5 shadow-xs cursor-pointer ${
                activeIndex === 0 
                  ? "opacity-40 cursor-not-allowed border-slate-100" 
                  : "hover:border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              title={t("Newer Update", "Novšia aktualizácia", "Újabb frissítés")}
            >
              <span className="hidden sm:inline type-overline">
                {t("Newer", "Novšie", "Újabb")}
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
