import { PRODUCT_NAME } from "../../utils/brand";
import { X, Loader2, Clock, Phone, CornerDownLeft, CornerLeftDown, FileText, TrendingUp, Calendar } from "lucide-react";
import { getTranslation } from "../../utils/translations";
import { TimelineAuthorBadge } from "../TimelineAuthorBadge";
import { formatTimestampLocalized } from "../../utils/localTime";
import { TimelineCollapsible } from "../TimelineCollapsible";
import { entityAccentStyle } from "../../utils/entityAccent";

interface EmailTimelineSlideoutProps {
  isClosingTimeline: boolean;
  closeTimelineSlideout: () => void;
  t: (en: string, sk: string, hu: string) => string;
  slideoutLead: any;
  isLoadingSlideoutEmails: boolean;
  slideoutTimelineEvents: any[];
  currentUser: any;
  projectManagerColors: Record<string, string>;
  systemLanguage: "en" | "sk" | "hu";
  expandedTimelineEventIds: Set<string>;
  toggleTimelineEventExpanded: (eventId: string) => void;
}

export const EmailTimelineSlideout: React.FC<EmailTimelineSlideoutProps> = ({
  isClosingTimeline, closeTimelineSlideout, t, slideoutLead, isLoadingSlideoutEmails, slideoutTimelineEvents,
  currentUser, projectManagerColors, systemLanguage, expandedTimelineEventIds, toggleTimelineEventExpanded,
}) => {
  return (
        <div style={entityAccentStyle("leads") as React.CSSProperties} className={`fixed inset-0 bg-gray-900/40 z-50 flex justify-end ${isClosingTimeline ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="flex-1" onClick={closeTimelineSlideout} />
          
          <div className={`w-125 max-w-full bg-white h-full shadow-xl flex flex-col relative ${isClosingTimeline ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
            {/* Header */}
            <div className="bg-gray-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="text-left">
                <span className="type-overline text-entity-text">{t(`${PRODUCT_NAME} Detail Timeline`, `Detailná časová os ${PRODUCT_NAME}`, `Részletes ${PRODUCT_NAME} idővonal`)}</span>
                <h3 className="text-body font-heading font-bold">{slideoutLead.name}</h3>
              </div>
              <button
                onClick={closeTimelineSlideout}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Timeline List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoadingSlideoutEmails && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-400">
                  <Loader2 className="animate-spin text-entity-text" size={20} />
                  <span className="type-overline">{t("Loading correspondences...", "Načítavanie korešpondencie...", "Levelezés betöltése...")}</span>
                </div>
              )}
              {slideoutTimelineEvents.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-ui font-semibold">
                  {t("No activities or email records logged on timeline.", "Na časovej osi nie sú zaznamenané žiadne aktivity ani e-maily.", "Nincsenek tevékenységek vagy e-mail bejegyzések az idővonalon.")}
                </div>
              ) : (
                <div className="space-y-4 relative border-l-2 border-gray-100 pl-4 text-left">
                  {slideoutTimelineEvents.map((event: any) => {
                    const pmName = event.author || slideoutLead.owner || currentUser?.name || "";
                    const pmColor = projectManagerColors[pmName] || "#6366f1";
                    let dotColor = "bg-blue-600 text-white border-blue-700";
                    let cardBorder = "border-gray-200 bg-gray-50/50";
                    let icon = <Clock size={12} />;

                    if (event.type === "phone") {
                      dotColor = "bg-blue-600 text-white border-blue-700";
                      icon = <Phone size={12} />;
                    } else if (event.type === "email") {
                      dotColor = "bg-indigo-600 text-white border-indigo-700";
                      icon = event.isOutgoing 
                        ? <CornerDownLeft size={12} /> 
                        : <CornerLeftDown size={12} />;
                    } else if (event.type === "note") {
                      dotColor = "bg-amber-500 text-white border-amber-600";
                      icon = <FileText size={12} />;
                    } else if (event.type === "offer") {
                      dotColor = "bg-emerald-600 text-white border-emerald-700";
                      icon = <TrendingUp size={12} />;
                    } else if (event.type === "appointment") {
                      dotColor = "bg-purple-600 text-white border-purple-700";
                      icon = <Calendar size={12} />;
                    }

                    return (
                      <div key={event.id} className="relative space-y-1 pb-1">
                        {/* Dot */}
                        <span className={`absolute -left-6.75 top-1 h-5.5 w-5.5 rounded-full border flex items-center justify-center shadow ${dotColor}`}>
                          {icon}
                        </span>
                        
                        <div className={`border p-3.5 rounded-lg shadow-xs ${cardBorder}`}>
                           <div className="flex justify-between items-center border-b border-gray-200/50 pb-1 mb-1.5 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="type-overline text-gray-900">{event.title}</span>
                              {event.type === "email" ? (
                                <>
                                  <span className="type-overline px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 flex items-center gap-1">
                                    {event.isOutgoing ? `📤 ${t("Outgoing", "Odchádzajúce", "Kimenő")}` : `📥 ${t("Incoming", "Prichádzajúce", "Bejövő")}`}
                                  </span>
                                  <span 
                                    className="inline-flex items-center gap-1 type-overline px-2.5 py-0.5 rounded-full border shadow-sm text-white"
                                    style={{ backgroundColor: pmColor, borderColor: pmColor }}
                                  >
                                    @ {pmName}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="type-overline px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700">
                                    {event.type === "phone" ? t("Call Logs", "Záznam hovoru", "Hívásnapló")
                                      : event.type === "email" ? t("Email Sent", "E-mail odoslaný", "E-mail elküldve")
                                      : event.type === "note" ? t("Timeline Note", "Poznámka na časovej osi", "Idővonal jegyzet")
                                      : event.type === "offer" ? t("Proposal", "Cenová ponuka", "Ajánlat")
                                      : event.type === "appointment" ? t("Meeting Log", "Záznam stretnutia", "Találkozó napló")
                                      : getTranslation(systemLanguage, `timeline.badge.${event.type}`)}
                                  </span>
                                  <TimelineAuthorBadge
                                    name={event.author}
                                    color={projectManagerColors[event.author || ""]}
                                  />
                                </>
                              )}
                            </div>
                            <span className="text-micro text-gray-400 font-extrabold">{formatTimestampLocalized(event.timestamp, systemLanguage)}</span>
                          </div>
                          <TimelineCollapsible
                            language={systemLanguage}
                            isExpanded={expandedTimelineEventIds.has(event.id)}
                            onToggle={() => toggleTimelineEventExpanded(event.id)}
                            fadeClassName="from-gray-50 via-gray-50/70"
                          >
                            <p className="text-micro text-gray-600 leading-[1.35] font-bold select-text whitespace-pre-wrap">
                              {event.content}
                            </p>
                          </TimelineCollapsible>
                          {event.amount && (
                            <span className="block mt-1 type-overline text-emerald-800">
                              {t("Worth:", "Hodnota:", "Érték:")} &euro; {event.amount.toLocaleString()}
                            </span>
                          )}
                          {event.extraTime && (
                            <span className="block mt-1 type-overline text-rose-800">
                              {t("Time:", "Čas:", "Idő:")} {event.extraTime}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
  );
};
