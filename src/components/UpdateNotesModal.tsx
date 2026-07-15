import React, { useState } from "react";
import { X, Sparkles, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { Language } from "../utils/translations";

export interface UpdateEntry {
  id: string;
  title: string;
  siteHandle: string;
  postDate: string;
  version: string;
  contentMatrix: Array<{
    __typename: string;
    text?: string;
    image?: Array<{ url: string; title: string }>;
    imageDirection?: string;
  }>;
}

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

  if (!isOpen || updates.length === 0) return null;

  const activeUpdate = updates[activeIndex];

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
              <h2 className="font-heading font-extrabold text-base text-slate-800 leading-tight">
                {t("Product Updates", "Novinky v systéme", "Termékfrissítések")}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
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
        <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-indigo-600 text-white font-black text-[10px] tracking-wider uppercase">
                  v{activeUpdate.version}
                </span>
                <h3 className="font-heading font-extrabold text-lg text-slate-800">
                  {activeUpdate.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-455 mt-1 select-none">
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
          <div className="space-y-6">
            {activeUpdate.contentMatrix?.map((block, idx) => {
              if (block.__typename === "textblock_Entry" && block.text) {
                return (
                  <div 
                    key={idx}
                    className="prose prose-slate max-w-none text-xs font-semibold text-slate-600 leading-relaxed font-sans"
                    dangerouslySetInnerHTML={{ __html: block.text }}
                  />
                );
              }

              if (block.__typename === "image_Entry" && block.image && block.image[0]) {
                const img = block.image[0];
                return (
                  <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200/80 shadow-md">
                    <img 
                      src={img.url} 
                      alt={img.title || "Update Image"} 
                      className="w-full h-auto object-cover max-h-[350px]"
                    />
                  </div>
                );
              }

              if (block.__typename === "imageWithText_Entry") {
                const img = block.image && block.image[0];
                const isRight = block.imageDirection === "right" || block.imageDirection === "Right";
                return (
                  <div 
                    key={idx} 
                    className={`flex flex-col md:flex-row gap-6 items-center ${isRight ? "md:flex-row-reverse" : ""}`}
                  >
                    {img && (
                      <div className="w-full md:w-1/2 rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm shrink-0">
                        <img 
                          src={img.url} 
                          alt={img.title || "Update Image"} 
                          className="w-full h-auto object-cover max-h-[220px]"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      {block.text && (
                        <div 
                          className="prose prose-slate max-w-none text-xs font-semibold text-slate-600 leading-relaxed font-sans"
                          dangerouslySetInnerHTML={{ __html: block.text }}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>

        {/* Pager / Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between select-none shrink-0">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
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
              className={`p-2 rounded-xl border border-slate-200 flex items-center justify-center transition-all bg-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer ${
                activeIndex === updates.length - 1 
                  ? "opacity-40 cursor-not-allowed border-slate-100" 
                  : "hover:border-slate-350 text-slate-700 hover:bg-slate-50"
              }`}
              title={t("Older Update", "Staršia aktualizácia", "Régebbi frissítés")}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline font-black uppercase text-[9px] tracking-wider">
                {t("Older", "Staršie", "Régebbi")}
              </span>
            </button>
            
            <button
              onClick={handleNext}
              disabled={activeIndex === 0}
              className={`p-2 rounded-xl border border-slate-200 flex items-center justify-center transition-all bg-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer ${
                activeIndex === 0 
                  ? "opacity-40 cursor-not-allowed border-slate-100" 
                  : "hover:border-slate-350 text-slate-700 hover:bg-slate-50"
              }`}
              title={t("Newer Update", "Novšia aktualizácia", "Újabb frissítés")}
            >
              <span className="hidden sm:inline font-black uppercase text-[9px] tracking-wider">
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
