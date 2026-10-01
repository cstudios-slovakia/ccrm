import { PageHeader } from "./layout";
import React, { useState, useEffect } from "react";
import { Sparkles, Calendar, Loader2 } from "lucide-react";
import type { Language } from "../utils/translations";
import type { UpdateEntry } from "./UpdateNotesModal";
import { useUserPref } from "../utils/userPrefs";
import { useUpdateFancybox, ZoomableUpdateImage } from "./ZoomableUpdateImage";

interface UpdateNotesViewProps {
    systemLanguage: Language;
}

export const UpdateNotesView: React.FC<UpdateNotesViewProps> = ({
    systemLanguage,
}) => {
    const [updates, setUpdates] = useState<UpdateEntry[]>([]);
    // Opening this view is what marks the newest release note as read; the flag is
    // a DB-backed user preference shared with the header's "new updates" dot.
    const [, setSeenUpdateId] = useUserPref("seenUpdateId");
    const setSeenUpdateIdRef = React.useRef(setSeenUpdateId);
    setSeenUpdateIdRef.current = setSeenUpdateId;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const activeUpdate = updates[activeIndex];
    useUpdateFancybox(contentRef, activeUpdate?.id);

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
                const res = await fetch(
                    "https://ccrm.softwaresolutions.sk/index.php?action=graphql/api",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                        body: JSON.stringify({ query }),
                    },
                );
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
                Object.keys(groups).forEach((ver) => {
                    const group = groups[ver];
                    let best =
                        group.find((e) => e.siteHandle === systemLanguage) ||
                        (systemLanguage === "sk"
                            ? group.find((e) => e.siteHandle === "default")
                            : undefined);
                    if (!best) {
                        best =
                            group.find((e) => e.siteHandle === "default") ||
                            group.find((e) => e.siteHandle === "en") ||
                            group[0];
                    }
                    if (best) localizedList.push(best);
                });

                // The CMS is the only source of release notes, so an entry that is
                // not published there must never show up in the app.
                const sortedUpdates = [...localizedList].sort(
                    (a, b) =>
                        new Date(b.postDate).getTime() -
                        new Date(a.postDate).getTime(),
                );
                setUpdates(sortedUpdates);

                // Mark as read when entering this view. The header reads the same
                // preference out of context, so its badge clears without an event hop.
                if (sortedUpdates.length > 0) {
                    setSeenUpdateIdRef.current(sortedUpdates[0].id);
                }
            } catch (err: any) {
                console.error("Error fetching release notes:", err);
                setError(
                    err?.message ||
                        t(
                            "Failed to load update notes from Craft CMS.",
                            "Nepodarilo sa načítať novinky zo servera Craft CMS.",
                            "Nem sikerült betölteni a frissítéseket a Craft CMS-ből.",
                        ),
                );
                setUpdates([]);
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
                <p className="text-ui font-semibold text-slate-400 mt-4">
                    {t(
                        "Loading update notes...",
                        "Načítavanie noviniek...",
                        "Frissítések betöltése...",
                    )}
                </p>
            </div>
        );
    }

    if (error || updates.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                <Sparkles className="h-10 w-10 text-slate-300" />
                <h3 className="font-heading font-extrabold text-title-sm text-slate-700 mt-4">
                    {t(
                        "No updates found",
                        "Žiadne novinky neboli nájdené",
                        "Nem találhatók frissítések",
                    )}
                </h3>
                <p className="text-ui text-slate-400 mt-2">
                    {error ||
                        t(
                            "Check back later for new releases.",
                            "Neskôr sa vráťte a skontrolujte nové verzie.",
                            "Nézzen vissza később az új verziókért.",
                        )}
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Module header (docs/VIEW-SIZE.md §6.2) */}
            <PageHeader
              icon={<Sparkles className="text-indigo-500" />}
              title={t("Product Updates & Releases", "Novinky a verzie systému", "Termékfrissítések és kiadások")}
              subtitle={t(
                "Stay up to date with the latest features, enhancements, and bug fixes added to the platform.",
                "Majte prehľad o najnovších funkciách, vylepšeniach a opravách chýb pridaných do platformy.",
                "Maradjon naprakész a platformhoz hozzáadott legújabb funkciókkal, fejlesztésekkel és hibajavításokkal.",
              )}
              badge={
                <span className="mt-2 inline-flex w-fit px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 type-overline">
                  {t("CCRM Changelog", "Zoznam zmien CCRM", "CCRM változásnapló")}
                </span>
              }
            />

            {/* Main Content Pane */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md flex flex-col ws-md:flex-row overflow-hidden min-h-125">
                {/* Versions Sidebar List */}
                <div className="w-full ws-md:w-64 border-b ws-md:border-b-0 ws-md:border-r border-slate-100 flex flex-col shrink-0 bg-slate-50/50">
                    <div className="p-4 border-b border-slate-100 select-none">
                        <span className="type-overline text-slate-400">
                            {t(
                                "Release History",
                                "História verzií",
                                "Kiadási előzmények",
                            )}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 max-h-75 ws-md:max-h-125">
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
                                    <span
                                        className={`px-2 py-0.5 rounded-md type-overline shrink-0 mt-0.5 ${
                                            isActive
                                                ? "bg-indigo-600 text-white"
                                                : "bg-slate-200 text-slate-600"
                                        }`}
                                    >
                                        v{update.version}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="font-bold text-ui truncate">
                                            {update.title}
                                        </div>
                                        <div className="text-micro text-slate-400 font-semibold mt-0.5">
                                            {new Date(
                                                update.postDate,
                                            ).toLocaleDateString(
                                                systemLanguage === "sk"
                                                    ? "sk-SK"
                                                    : systemLanguage === "hu"
                                                      ? "hu-HU"
                                                      : "en-US",
                                                {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                },
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Release Detail */}
                <div
                    ref={contentRef}
                    className="flex-1 p-6 ws-md:p-8 flex flex-col overflow-y-auto"
                >
                    {activeUpdate && (
                        <>
                            <div className="border-b border-slate-100 pb-4 mb-6">
                                <div className="flex items-center gap-2.5">
                                    <span className="px-3 py-1 rounded-full bg-indigo-600 text-white type-overline">
                                        v{activeUpdate.version}
                                    </span>
                                    <h2 className="font-heading font-extrabold text-title text-slate-800">
                                        {activeUpdate.title}
                                    </h2>
                                </div>
                                <div className="flex items-center gap-1 text-caption font-semibold text-slate-400 mt-2 select-none">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>
                                        {new Date(
                                            activeUpdate.postDate,
                                        ).toLocaleDateString(
                                            systemLanguage === "sk"
                                                ? "sk-SK"
                                                : systemLanguage === "hu"
                                                  ? "hu-HU"
                                                  : "en-US",
                                            {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            },
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Content Matrix blocks */}
                            <div className="space-y-6 flex-1">
                                {activeUpdate.contentMatrix?.map(
                                    (block, idx) => {
                                        if (
                                            block.__typename ===
                                                "textblock_Entry" &&
                                            block.text?.html
                                        ) {
                                            return (
                                                <div
                                                    key={idx}
                                                    className="prose prose-slate max-w-none text-body text-slate-600 leading-relaxed font-sans ck-content"
                                                    dangerouslySetInnerHTML={{
                                                        __html: block.text.html,
                                                    }}
                                                />
                                            );
                                        }

                                        if (
                                            block.__typename ===
                                                "image_Entry" &&
                                            block.image &&
                                            block.image[0]
                                        ) {
                                            const img = block.image[0];
                                            return (
                                                <ZoomableUpdateImage
                                                    key={idx}
                                                    src={img.url}
                                                    alt={
                                                        img.title ||
                                                        t(
                                                            "Update Image",
                                                            "Obrázok novinky",
                                                            "Frissítés képe",
                                                        )
                                                    }
                                                    caption={img.title}
                                                    group={`update-${activeUpdate.id}`}
                                                    openLabel={t(
                                                        "Open full size",
                                                        "Otvoriť v plnej veľkosti",
                                                        "Megnyitás teljes méretben",
                                                    )}
                                                    className="border border-slate-200/80 shadow-md"
                                                    imageClassName="h-auto max-h-120"
                                                />
                                            );
                                        }

                                        if (
                                            block.__typename ===
                                            "imageWithText_Entry"
                                        ) {
                                            const img =
                                                block.image && block.image[0];
                                            const isRight =
                                                block.imageDirection === true ||
                                                block.imageDirection ===
                                                    "right" ||
                                                block.imageDirection ===
                                                    "Right" ||
                                                block.imageDirection === "on" ||
                                                block.imageDirection === "On";
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex flex-col ws-md:flex-row gap-6 items-center ${isRight ? "md:flex-row-reverse" : ""}`}
                                                >
                                                    {img && (
                                                        <div className="w-full ws-md:w-1/2 rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm shrink-0">
                                                            <ZoomableUpdateImage
                                                                src={img.url}
                                                                alt={
                                                                    img.title ||
                                                                    t(
                                                                        "Update Image",
                                                                        "Obrázok novinky",
                                                                        "Frissítés képe",
                                                                    )
                                                                }
                                                                caption={
                                                                    img.title
                                                                }
                                                                group={`update-${activeUpdate.id}`}
                                                                openLabel={t(
                                                                    "Open full size",
                                                                    "Otvoriť v plnej veľkosti",
                                                                    "Megnyitás teljes méretben",
                                                                )}
                                                                imageClassName="h-auto max-h-80"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        {block.text?.html && (
                                                            <div
                                                                className="prose prose-slate max-w-none text-body text-slate-600 leading-relaxed font-sans ck-content"
                                                                dangerouslySetInnerHTML={{
                                                                    __html: block
                                                                        .text
                                                                        .html,
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return null;
                                    },
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
