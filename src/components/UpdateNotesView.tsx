import React, { useState, useEffect } from "react";
import { Sparkles, Calendar, Loader2 } from "lucide-react";
import type { Language } from "../utils/translations";
import type { UpdateEntry } from "./UpdateNotesModal";

interface UpdateNotesViewProps {
  systemLanguage: Language;
}

export const UpdateNotesView: React.FC<UpdateNotesViewProps> = ({ systemLanguage }) => {
  const [updates, setUpdates] = useState<UpdateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "sk") return sk;
    if (systemLanguage === "hu") return hu;
    return en;
  };

  useEffect(() => {
    const fetchUpdateNotes = async () => {
      const query = `
        query GetUpdateNotes {
          entries(section: "updateNotes", site: "*") {
            id
            title
            siteHandle
            postDate @formatDateTime(format: "Y-m-d")
            ... on news_Entry {
              version
              contentMatrix {
                __typename
                ... on textblock_Entry {
                  text { html }
                }
                ... on image_Entry {
                  image {
                    url
                    title
                  }
                }
                ... on imageWithText_Entry {
                  text { html }
                  image {
                    url
                    title
                  }
                  imageDirection
                }
              }
            }
          }
        }
      `;
      try {
        const res = await fetch("https://ccrm.softwaresolutions.sk/index.php?action=graphql/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error("Network response was not ok");
        const json = await res.json();
        const rawEntries = json.data?.entries || [];

        const groups: Record<string, UpdateEntry[]> = {};
        rawEntries.forEach((e: any) => {
          if (!e.version) return;
          if (!groups[e.version]) groups[e.version] = [];
          groups[e.version].push(e);
        });

        const localizedList: UpdateEntry[] = [];
        Object.keys(groups).forEach(ver => {
          const group = groups[ver];
          let best = group.find(e => e.siteHandle === systemLanguage);
          if (!best) {
            best = group.find(e => e.siteHandle === "en") || group.find(e => e.siteHandle === "sk") || group[0];
          }
          if (best) localizedList.push(best);
        });

        localizedList.sort((a, b) => new Date(b.postDate).getTime() - new Date(a.postDate).getTime());
        setUpdates(localizedList);
        
        // Mark as read when entering this view
        if (localizedList.length > 0) {
          localStorage.setItem("ccrm_seen_update_id", localizedList[0].id);
          // Dispatch a storage event or window event if we need to sync header badge
          window.dispatchEvent(new Event("storage"));
        }
      } catch (err: any) {
        console.error("Error fetching release notes:", err);
        setError(err.message || "Failed to fetch updates");
      } finally {
        setLoading(false);
      }
    };
    fetchUpdateNotes();
  }, [systemLanguage]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-400 mt-4">
          {t("Loading update notes...", "Načítavanie noviniek...", "Frissítések betöltése...")}
        </p>
      </div>
    );
  }

  if (error || updates.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <Sparkles className="h-10 w-10 text-slate-300" />
        <h3 className="font-heading font-extrabold text-base text-slate-700 mt-4">
          {t("No updates found", "Žiadne novinky neboli nájdené", "Nem találhatók frissítések")}
        </h3>
        <p className="text-xs text-slate-400 mt-2">
          {t("Check back later for new releases.", "Neskôr sa vráťte a skontrolujte nové verzie.", "Nézzen vissza később az új verziókért.")}
        </p>
      </div>
    );
  }

  const activeUpdate = updates[activeIndex];

  return (
    <div className="flex-1 flex flex-col gap-6 w-full max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden select-none">
        <div className="absolute right-0 bottom-0 opacity-15 transform translate-x-6 translate-y-6">
          <Sparkles className="h-48 w-48" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-black text-[9px] tracking-wider uppercase backdrop-blur-md">
              CCRM Changelog
            </span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl mt-3 leading-tight">
            {t("Product Updates & Releases", "Novinky a verzie systému", "Termékfrissítések és kiadások")}
          </h1>
          <p className="text-white/80 text-xs md:text-sm mt-2 max-w-xl font-medium">
            {t(
              "Stay up to date with the latest features, enhancements, and bug fixes added to the platform.",
              "Majte prehľad o najnovších funkciách, vylepšeniach a opravách chýb pridaných do platformy.",
              "Maradjon naprakész a platformhoz hozzáadott legújabb funkciókkal, fejlesztésekkel és hibajavításokkal."
            )}
          </p>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md flex flex-col md:flex-row overflow-hidden min-h-[500px]">
        {/* Versions Sidebar List */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col shrink-0 bg-slate-50/50">
          <div className="p-4 border-b border-slate-100 select-none">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {t("Release History", "História verzií", "Kiadási előzmények")}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 max-h-[300px] md:max-h-[500px]">
            {updates.map((update, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={update.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`w-full text-left p-3 rounded-2xl transition-all flex items-start gap-3 cursor-pointer border ${
                    isActive
                      ? "bg-white border-slate-200 text-indigo-600 shadow-xs"
                      : "bg-transparent border-transparent text-slate-600 hover:bg-white/50"
                  }`}
                >
                  <span className={`px-2 py-0.5 rounded-md font-black text-[9px] uppercase tracking-wider shrink-0 mt-0.5 ${
                    isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    v{update.version}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-xs truncate">{update.title}</div>
                    <div className="text-[9px] text-slate-400 font-semibold mt-0.5">
                      {new Date(update.postDate).toLocaleDateString(
                        systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US",
                        { year: "numeric", month: "short", day: "numeric" }
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Release Detail */}
        <div className="flex-1 p-6 md:p-8 flex flex-col overflow-y-auto">
          {activeUpdate && (
            <>
              <div className="border-b border-slate-100 pb-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-full bg-indigo-600 text-white font-black text-[10px] tracking-wider uppercase">
                    v{activeUpdate.version}
                  </span>
                  <h2 className="font-heading font-extrabold text-xl text-slate-800">
                    {activeUpdate.title}
                  </h2>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-455 mt-2 select-none">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {new Date(activeUpdate.postDate).toLocaleDateString(
                      systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US",
                      { year: "numeric", month: "long", day: "numeric" }
                    )}
                  </span>
                </div>
              </div>

              {/* Content Matrix blocks */}
              <div className="space-y-6 flex-1">
                {activeUpdate.contentMatrix?.map((block, idx) => {
                  if (block.__typename === "textblock_Entry" && block.text?.html) {
                    return (
                      <div
                        key={idx}
                        className="prose prose-slate max-w-none text-xs text-slate-600 leading-relaxed font-sans ck-content"
                        dangerouslySetInnerHTML={{ __html: block.text.html }}
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
                    const isRight = block.imageDirection === true || block.imageDirection === "right" || block.imageDirection === "Right" || block.imageDirection === "on" || block.imageDirection === "On";
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
                          {block.text?.html && (
                            <div
                              className="prose prose-slate max-w-none text-xs text-slate-600 leading-relaxed font-sans ck-content"
                              dangerouslySetInnerHTML={{ __html: block.text.html }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
