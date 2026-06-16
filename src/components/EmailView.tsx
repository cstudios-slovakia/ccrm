import React, { useState, useEffect, useMemo } from "react";
import { 
  Send, Trash2, Search, Mail, Plus, X, Loader2, 
  Reply, CheckCircle2, CircleAlert, Clock, Phone, FileText, Calendar, TrendingUp,
  CornerDownLeft, CornerLeftDown, ChevronDown, ChevronUp
} from "lucide-react";
import type { Lead } from "../types";

interface EmailViewProps {
  currentUser: any;
  leads: Lead[];
  setLeads: any;
  systemLanguage: "en" | "sk" | "hu";
  projectManagerColors?: Record<string, string>;
}

// Geometric Icon component from AuroraMail
const GeometricIcon: React.FC<{ emailString?: string }> = ({ emailString }) => {
  if (!emailString) return null;
  let hash = 0;
  for (let i = 0; i < emailString.length; i++) {
    hash = emailString.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  
  const hue = hash % 360;
  const color = `hsl(${hue}, 70%, 60%)`;
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
  const shape = shapes[hash % shapes.length];

  return (
    <svg width="12" height="12" viewBox="0 0 20 20" style={{ marginRight: '6px', flexShrink: 0 }}>
      {shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
      {shape === 'square' && <rect x="2" y="2" width="16" height="16" rx="4" fill={color} />}
      {shape === 'triangle' && <polygon points="10,2 18,18 2,18" fill={color} strokeLinejoin="round" />}
      {shape === 'diamond' && <polygon points="10,2 18,10 10,18 2,10" fill={color} />}
      {shape === 'hexagon' && <polygon points="10,1 18,5 18,15 10,19 2,15 2,5" fill={color} />}
    </svg>
  );
};

export const EmailView: React.FC<EmailViewProps> = ({
  currentUser,
  leads,
  systemLanguage: _systemLanguage,
  projectManagerColors = {}
}) => {
  // Folder & Email States
  const activeFolder = "INBOX";
  const [emails, setEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [threadBodies, setThreadBodies] = useState<Record<string, any>>({});
  
  // Thread mode configurations
  const [isThreadedMode, setIsThreadedMode] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [expandedEmailUids, setExpandedEmailUids] = useState<Record<string, boolean>>({});

  // Slideout timeline state
  const [slideoutLead, setSlideoutLead] = useState<any | null>(null);
  const [isTimelineSlideoutOpen, setIsTimelineSlideoutOpen] = useState(false);
  const [isClosingTimeline, setIsClosingTimeline] = useState(false);

  const closeTimelineSlideout = () => {
    setIsClosingTimeline(true);
    setTimeout(() => {
      setIsTimelineSlideoutOpen(false);
      setIsClosingTimeline(false);
    }, 350);
  };

  const [slideoutEmails, setSlideoutEmails] = useState<any[]>([]);
  const [isLoadingSlideoutEmails, setIsLoadingSlideoutEmails] = useState(false);

  // Match current selected email to CRM client / lead
  const matchedClient = useMemo(() => {
    if (!selectedEmail) return null;
    const addr = selectedEmail.from?.address?.toLowerCase() || "";
    return leads.find(l => l.email && l.email.toLowerCase() === addr) || null;
  }, [selectedEmail, leads]);
  
  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  
  // UI Loaders
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Composers and notifications
  const [composers, setComposers] = useState<any[]>([]);
  const [notification, setNotification] = useState<any | null>(null);

  const closeComposer = (composerId: number) => {
    setComposers(prev => prev.map(c => c.id === composerId ? { ...c, isClosing: true } : c));
    setTimeout(() => {
      setComposers(prev => prev.filter(c => c.id !== composerId));
    }, 350);
  };

  // Connection config references
  const userEmailSettings = useMemo(() => {
    try {
      if (currentUser && currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        return metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing user emailSettings", e);
    }
    return null;
  }, [currentUser]);

  // Load timeline emails for the slideout lead
  useEffect(() => {
    if (!slideoutLead || !slideoutLead.email || !userEmailSettings || !userEmailSettings.isValidated) {
      setSlideoutEmails([]);
      return;
    }

    const fetchLeadMails = async () => {
      setIsLoadingSlideoutEmails(true);
      try {
        const inboxRes = await fetch(
          `/api/mail_broker.php?action=get_emails&folder=INBOX&email=${encodeURIComponent(slideoutLead.email || "")}`,
          { headers: { "X-User-Email": currentUser.email } }
        );
        const inboxData = await inboxRes.json();
        
        let sentEmails: any[] = [];
        try {
          const sentRes = await fetch(
            `/api/mail_broker.php?action=get_emails&folder=Sent&email=${encodeURIComponent(slideoutLead.email || "")}`,
            { headers: { "X-User-Email": currentUser.email } }
          );
          const sentData = await sentRes.json();
          if (sentData.success && Array.isArray(sentData.emails)) {
            sentEmails = sentData.emails;
          }
        } catch (e) {}

        const combinedEmails: any[] = [];
        const processMail = (mail: any) => {
          const isOutgoing = mail.from?.address?.toLowerCase() === currentUser?.email?.toLowerCase();
          const folderPrefix = isOutgoing ? "sent" : "inbox";
          return {
            id: `email-${folderPrefix}-${mail.uid}`,
            type: "email",
            timestamp: mail.date.substring(0, 16),
            title: mail.subject || "(No Subject)",
            content: `From: ${mail.from.name || mail.from.address} <${mail.from.address}>\n\nTo view this email or reply, please open the Mail Client.`,
            seen: mail.seen,
            isOutgoing
          };
        };

        if (inboxData.success && Array.isArray(inboxData.emails)) {
          inboxData.emails.forEach((m: any) => combinedEmails.push(processMail(m)));
        }
        sentEmails.forEach((m: any) => combinedEmails.push(processMail(m)));
        setSlideoutEmails(combinedEmails);
      } catch (err) {
        console.error("Failed to load slideout timeline emails", err);
      } finally {
        setIsLoadingSlideoutEmails(false);
      }
    };

    fetchLeadMails();
  }, [slideoutLead, userEmailSettings, currentUser]);

  const slideoutTimelineEvents = useMemo(() => {
    if (!slideoutLead) return [];
    const standardEvents = slideoutLead.timeline || [];
    const emailIds = new Set(slideoutEmails.map(e => e.id));
    const merged = [
      ...standardEvents.filter((e: any) => !emailIds.has(e.id)),
      ...slideoutEmails
    ];
    return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [slideoutLead, slideoutEmails]);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load Emails headers list
  const loadEmails = async (currPage = 1, currFilter = filter) => {
    if (!userEmailSettings) return;
    setIsLoadingEmails(true);
    try {
      // Fetch Inbox folder emails
      const resInbox = await fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=${currPage}&filter=${currFilter}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const dataInbox = await resInbox.json();
      
      let inboxMails: any[] = [];
      if (dataInbox.success && Array.isArray(dataInbox.emails)) {
        inboxMails = dataInbox.emails.map((m: any) => ({ ...m, isSent: false }));
      }

      // Fetch Sent folder emails
      let sentMails: any[] = [];
      try {
        const resSent = await fetch(`/api/mail_broker.php?action=get_emails&folder=Sent&page=${currPage}&filter=${currFilter}`, {
          headers: { "X-User-Email": currentUser.email }
        });
        const dataSent = await resSent.json();
        if (dataSent.success && Array.isArray(dataSent.emails)) {
          sentMails = dataSent.emails.map((m: any) => ({ ...m, isSent: true }));
        }
      } catch (e) {
        console.warn("Could not fetch Sent folder emails", e);
      }

      // Merge both folders and sort chronologically (newest first)
      const combined = [...inboxMails, ...sentMails].sort((a: any, b: any) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setEmails(combined);
    } catch (err) {
      notify("Mail server unreachable", "error");
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Expand Single message details
  const expandThreadMessage = async (email: any) => {
    if (threadBodies[email.uid]) {
      setSelectedEmail(email);
      return;
    }
    setIsLoadingDetail(true);
    const folderToUse = email.isSent ? "Sent" : activeFolder;
    try {
      const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const data = await res.json();
      if (data.success) {
        setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
        setSelectedEmail(email);
        
        // Mark as seen locally
        setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: true } : e));
      } else {
        notify(data.error || "Could not retrieve email contents", "error");
      }
    } catch (err) {
      notify("Connection to mail broker lost", "error");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Initial loads
  useEffect(() => {
    if (userEmailSettings) {
      loadEmails(1, filter);
    }
  }, [userEmailSettings, filter]);

  // Compose a new email
  const openNewComposer = (defaultTo = "", defaultSubject = "", defaultBody = "") => {
    const newComp = {
      id: Date.now(),
      to: defaultTo,
      subject: defaultSubject,
      body: defaultBody,
      isMinimized: false
    };
    setComposers(prev => [...prev, newComp]);
  };

  const handleSendEmail = async (composer: any) => {
    setIsSending(true);
    try {
      const res = await fetch("/api/mail_broker.php?action=send_email", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-User-Email": currentUser.email
        },
        body: JSON.stringify({
          to: composer.to,
          subject: composer.subject,
          html: composer.body
        })
      });
      const data = await res.json();
      if (data.success) {
        notify("Email sent successfully!");
        closeComposer(composer.id);
        loadEmails(1, filter);
      } else {
        notify(data.error || "Failed to transmit message via SMTP", "error");
      }
    } catch (err) {
      notify("Failed to connect to SMTP transmission agent", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteEmail = async (uid: any) => {
    if (!confirm("Are you sure you want to delete this email?")) return;
    try {
      const res = await fetch(`/api/mail_broker.php?action=delete_email&uid=${uid}&folder=${encodeURIComponent(activeFolder)}`, {
        method: "DELETE",
        headers: { "X-User-Email": currentUser.email }
      });
      const data = await res.json();
      if (data.success) {
        notify("Email deleted successfully.");
        setSelectedEmail(null);
        loadEmails(1, filter);
      } else {
        notify(data.error || "Failed to remove email", "error");
      }
    } catch (err) {
      notify("Communication block error.", "error");
    }
  };

  // Group emails to Conversation flows (threads)
  const threadedEmails = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // First, filter individual emails by search query
    const filtered = emails.filter(e => {
      if (!query) return true;
      return (
        (e.subject || "").toLowerCase().includes(query) ||
        (e.from.name || "").toLowerCase().includes(query) ||
        (e.from.address || "").toLowerCase().includes(query) ||
        (e.to?.name || "").toLowerCase().includes(query) ||
        (e.to?.address || "").toLowerCase().includes(query)
      );
    });

    const threadsMap: Record<string, any[]> = {};
    
    filtered.forEach(email => {
      // Strips Re:, Fwd:, etc.
      let normSubject = (email.subject || "")
        .replace(/^(re|fwd|fw|odp|odpověď|rehg|ref|odpověd|odp):\s*/i, "")
        .trim();
      if (!normSubject) {
        normSubject = "(No Subject)";
      }
      
      if (!threadsMap[normSubject]) {
        threadsMap[normSubject] = [];
      }
      threadsMap[normSubject].push(email);
    });
    
    const threadsList = Object.keys(threadsMap).map(subject => {
      const list = threadsMap[subject];
      // Sort oldest to newest
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const latestEmail = list[list.length - 1];
      const hasUnseen = list.some(e => !e.seen);
      
      return {
        id: subject,
        subject: subject,
        latestEmail,
        emails: list,
        seen: !hasUnseen,
        date: latestEmail.date
      };
    });
    
    // Sort threads by latest message date DESC
    threadsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return threadsList;
  }, [emails, searchQuery]);

  const activeThread = useMemo(() => {
    if (!isThreadedMode || !selectedThreadId) return null;
    return threadedEmails.find(t => t.id === selectedThreadId) || null;
  }, [isThreadedMode, selectedThreadId, threadedEmails]);

  // Toggle expand/collapse inside conversation flow and load detail inline lazily
  const toggleEmailExpand = async (email: any) => {
    const isExpanded = !expandedEmailUids[email.uid];
    setExpandedEmailUids(prev => ({ ...prev, [email.uid]: isExpanded }));
    
    if (isExpanded && !threadBodies[email.uid]) {
      setIsLoadingDetail(true);
      const folderToUse = email.isSent ? "Sent" : activeFolder;
      try {
        const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}`, {
          headers: { "X-User-Email": currentUser.email }
        });
        const data = await res.json();
        if (data.success) {
          setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
          // Mark as seen locally
          setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: true } : e));
        }
      } catch (err) {
        console.warn("Failed to retrieve threaded email detail", err);
      } finally {
        setIsLoadingDetail(false);
      }
    }
  };

  // Filtered individual emails for unthreaded mode
  const filteredIndividualEmails = useMemo(() => {
    return emails.filter(e => {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      return (
        (e.subject || "").toLowerCase().includes(query) ||
        (e.from.name || "").toLowerCase().includes(query) ||
        (e.from.address || "").toLowerCase().includes(query)
      );
    });
  }, [emails, searchQuery]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 select-none h-[calc(100vh-140px)] items-start overflow-hidden animate-slide-up">
      {/* Notifications banner */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-50 px-5 py-3.5 rounded-2xl flex items-center gap-3 border shadow-2xl ${
          notification.type === "success" ? "bg-emerald-50 border-emerald-250 text-emerald-900" : "bg-rose-50 border-rose-250 text-rose-900"
        }`}>
          {notification.type === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          <span className="text-xs font-bold">{notification.text}</span>
        </div>
      )}

      {/* COLUMN 1: Headers List */}
      <div className="lg:col-span-5 glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full">
        {/* Search & Filter Header */}
        <div className="space-y-3 pb-3 border-b border-slate-150">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => openNewComposer()}
              className="py-2 px-3.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow shrink-0 cursor-pointer"
            >
              <Plus size={14} /> New
            </button>
          </div>
          
          <div className="flex items-center justify-between bg-slate-55 p-1 rounded-2xl border border-slate-200/40">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 text-[10px] font-black uppercase tracking-wider flex-1 mr-3">
              <button
                onClick={() => setFilter("all")}
                className={`flex-1 py-1.5 rounded-lg transition-all ${filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                All Threads
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`flex-1 py-1.5 rounded-lg transition-all ${filter === "unread" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Unread
              </button>
            </div>
            
            {/* Threaded Toggle Switch */}
            <div className="flex items-center gap-2 select-none border-l border-slate-200 pl-3.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Flow Mode</span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={isThreadedMode} 
                  onChange={(e) => {
                    setIsThreadedMode(e.target.checked);
                    setSelectedEmail(null);
                    setSelectedThreadId(null);
                    setExpandedEmailUids({});
                  }} 
                  className="sr-only peer" 
                />
                <div className="w-8 h-4.5 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-pink-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* List of Email Cards */}
        <div className="flex-1 overflow-y-auto space-y-2 pt-3">
          {isLoadingEmails ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={24} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Syncing Envelopes...</span>
            </div>
          ) : isThreadedMode ? (
            /* Threaded List View */
            threadedEmails.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                No threads found.
              </div>
            ) : (
              threadedEmails.map(thread => {
                const isSelected = selectedThreadId === thread.id;
                const latest = thread.latestEmail;
                const matchedClient = leads.find(l => l.email && l.email.toLowerCase() === latest.from.address.toLowerCase());
                
                return (
                  <div
                    key={thread.id}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setExpandedEmailUids({ [latest.uid]: true });
                      // Load details for latest message
                      toggleEmailExpand(latest);
                    }}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected 
                        ? "border-pink-300 bg-pink-50/20 shadow-sm" 
                        : !thread.seen 
                          ? "border-slate-200 bg-white font-black shadow-sm" 
                          : "border-slate-100 bg-white/40 text-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className={`text-[12px] truncate max-w-[170px] ${!thread.seen ? "text-slate-900 font-extrabold" : "text-slate-800"}`}>
                        {latest.isSent ? (
                          <><span className="text-slate-400 font-bold">To:</span> {latest.to?.name || latest.to?.address || "Unknown"}</>
                        ) : (
                          <><span className="text-slate-400 font-bold">From:</span> {latest.from.name || latest.from.address}</>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[8.5px] font-extrabold bg-pink-100/80 text-pink-700 px-1.5 py-0.5 rounded-md leading-none">
                          {thread.emails.length} msg
                        </span>
                        <span className="text-[8.5px] text-slate-400 font-semibold">
                          {new Date(thread.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <GeometricIcon emailString={latest.isSent ? (latest.to?.address || "") : latest.from.address} />
                      <span className={`text-[11px] truncate max-w-[240px] ${!thread.seen ? "text-slate-900 font-bold" : "text-slate-700"}`}>
                        {thread.subject}
                      </span>
                    </div>

                    {matchedClient && (
                      <span className="w-fit text-[8px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-250">
                        🤝 CRM Match: {matchedClient.name}
                      </span>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* Unthreaded List View */
            filteredIndividualEmails.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                No conversations found.
              </div>
            ) : (
              filteredIndividualEmails.map(email => {
                const isSelected = selectedEmail?.uid === email.uid;
                const matchedClient = leads.find(l => l.email && l.email.toLowerCase() === email.from.address.toLowerCase());
                
                return (
                  <div
                    key={email.uid}
                    onClick={() => expandThreadMessage(email)}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected 
                        ? "border-pink-300 bg-pink-50/20 shadow-sm" 
                        : !email.seen 
                          ? "border-slate-200 bg-white font-black shadow-xs" 
                          : "border-slate-100 bg-white/30 text-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className={`text-[12px] truncate max-w-[200px] ${!email.seen ? "text-slate-900 font-extrabold" : "text-slate-800"}`}>
                        {email.isSent ? (
                          <><span className="text-slate-400 font-bold">To:</span> {email.to?.name || email.to?.address || "Unknown"}</>
                        ) : (
                          <><span className="text-slate-400 font-bold">From:</span> {email.from.name || email.from.address}</>
                        )}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium shrink-0">
                        {new Date(email.date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <GeometricIcon emailString={email.isSent ? (email.to?.address || "") : email.from.address} />
                      <span className={`text-[11px] truncate max-w-[260px] ${!email.seen ? "text-slate-900 font-bold" : "text-slate-700"}`}>
                        {email.isSent ? "📤 " : "📥 "}{email.subject || "(No Subject)"}
                      </span>
                    </div>

                    {matchedClient && (
                      <span className="w-fit text-[8px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-250">
                        🤝 CRM Match: {matchedClient.name}
                      </span>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* COLUMN 2: Mail Detail / Conversation flow Detail Pane */}
      <div className="lg:col-span-7 glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full overflow-hidden">
        {isThreadedMode ? (
          /* Render Thread Flow */
          activeThread ? (
            <div className="h-full flex flex-col justify-between overflow-hidden">
              {/* Thread Header */}
              <div className="border-b border-slate-150 pb-3 flex items-center justify-between shrink-0 text-left">
                <div>
                  <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight">{activeThread.subject}</h3>
                  <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase block mt-1">
                    Thread Flow ({activeThread.emails.length} correspondence units)
                  </span>
                </div>
                
                {/* Global reply button to latest sender */}
                <button
                  onClick={() => openNewComposer(activeThread.latestEmail.from.address, `Re: ${activeThread.subject}`)}
                  className="px-3.5 py-1.5 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:text-pink-800 text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <Reply size={13} />
                  Reply Thread
                </button>
              </div>

              {/* CRM Match Info card */}
              {(() => {
                const client = leads.find(l => l.email && l.email.toLowerCase() === activeThread.latestEmail.from.address.toLowerCase());
                if (!client) return null;
                return (
                  <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤝</span>
                      <div>
                        <h4 className="text-[9px] font-black text-emerald-950 uppercase tracking-tight">CRM Client / Lead</h4>
                        <p className="text-[10.5px] text-emerald-850 font-extrabold mt-0.5">
                          Name: <span className="text-emerald-950 font-black">{client.name}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSlideoutLead(client);
                          setIsTimelineSlideoutOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        Timeline
                      </button>
                      <button
                        onClick={() => window.location.hash = `client-${encodeURIComponent(client.name)}`}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        Profile
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Message cards chronological flow */}
              <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1 scrollbar-thin">
                {activeThread.emails.map((email) => {
                  const isExpanded = !!expandedEmailUids[email.uid];
                  const bodyObj = threadBodies[email.uid];
                  const isOut = email.isSent;

                  return (
                    <div 
                      key={email.uid} 
                      className={`border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 text-left ${
                        isExpanded ? "border-slate-205 bg-slate-50/10" : "border-slate-150 hover:bg-slate-50/20 bg-white"
                      }`}
                    >
                      {/* Email Header line */}
                      <div 
                        onClick={() => toggleEmailExpand(email)}
                        className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none ${
                          isExpanded ? "bg-slate-50 border-b border-slate-200/80" : "bg-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${
                            isOut ? "bg-pink-100 text-pink-700" : "bg-indigo-100 text-indigo-700"
                          }`}>
                            {isOut ? "📤" : "📥"}
                          </span>
                          <div className="min-w-0">
                            <span className="text-[11px] font-extrabold text-slate-800 truncate block">
                              {isOut ? `To: ${email.to?.name || email.to?.address}` : `From: ${email.from.name || email.from.address}`}
                            </span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              {email.subject || "(No Subject)"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3.5 shrink-0">
                          <span className="text-[9px] text-slate-400 font-bold">
                            {new Date(email.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          
                          {/* Mini Expand Icon */}
                          <div className="text-slate-400 hover:text-slate-700">
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </div>
                      </div>

                      {/* Email Card Body content */}
                      {isExpanded && (
                        <div className="p-4 bg-white min-h-[150px]">
                          {isLoadingDetail && !bodyObj ? (
                            <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                              <Loader2 className="animate-spin text-pink-500" size={16} />
                              <span className="text-[9px] font-bold uppercase tracking-wider">Decoding part...</span>
                            </div>
                          ) : bodyObj ? (
                            <iframe 
                              className="w-full min-h-[220px] max-h-[400px] border-0 bg-transparent"
                              title={`Thread body ${email.uid}`}
                              srcDoc={`
                                <html>
                                  <head>
                                    <style>
                                      body {
                                        font-family: system-ui, -apple-system, sans-serif;
                                        color: #1e293b;
                                        line-height: 1.5;
                                        font-size: 12.5px;
                                        margin: 0;
                                        padding: 4px;
                                      }
                                      a { color: #db2777; text-decoration: none; }
                                      blockquote { border-left: 2px solid #cbd5e1; padding-left: 10px; color: #64748b; margin: 8px 0; }
                                    </style>
                                  </head>
                                  <body>
                                    ${bodyObj.html || bodyObj.text || ''}
                                  </body>
                                </html>
                              `}
                            />
                          ) : (
                            <div className="text-center py-6 text-[10px] font-bold text-slate-400 uppercase">
                              Content not found.
                            </div>
                          )}
                          
                          {/* Footer Action items inside card */}
                          <div className="mt-3.5 pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                            <button
                              onClick={() => openNewComposer(email.from.address, `Re: ${email.subject}`)}
                              className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-[9px] font-bold text-slate-600 hover:text-slate-800 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Reply size={11} /> Reply
                            </button>
                            <button
                              onClick={() => handleDeleteEmail(email.uid)}
                              className="px-3 py-1.5 border border-rose-200 bg-white hover:bg-rose-50 text-[9px] font-bold text-rose-600 hover:text-rose-800 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Mail size={40} className="stroke-[1.5] text-slate-350 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select a threaded conversation flow</span>
            </div>
          )
        ) : (
          /* Render Traditional Unthreaded Details */
          isLoadingDetail ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={32} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Decoding Message...</span>
            </div>
          ) : selectedEmail ? (() => {
            const bodyObj = threadBodies[selectedEmail.uid];
            
            return (
              <div className="h-full flex flex-col justify-between">
                {/* Header */}
                <div className="border-b border-slate-150 pb-3 flex items-center justify-between gap-3 shrink-0">
                  <div className="text-left">
                    <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight">{selectedEmail.subject || "(No Subject)"}</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">
                      From: <strong className="text-slate-800">{selectedEmail.from.name || selectedEmail.from.address}</strong> &lt;{selectedEmail.from.address}&gt;
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openNewComposer(selectedEmail.from.address, `Re: ${selectedEmail.subject}`)}
                      className="p-2 hover:bg-slate-100 text-slate-655 rounded-xl border border-slate-250 hover:text-slate-900 cursor-pointer"
                      title="Reply"
                    >
                      <Reply size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteEmail(selectedEmail.uid)}
                      className="p-2 hover:bg-rose-50 text-rose-655 rounded-xl border border-rose-250 hover:text-rose-700 cursor-pointer"
                      title="Delete Message"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* CRM Match Card */}
                {matchedClient && (
                  <div className="bg-emerald-50 border border-emerald-250 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🤝</span>
                      <div>
                        <h4 className="text-[10px] font-black text-emerald-950 uppercase tracking-tight">CRM Client / Lead</h4>
                        <p className="text-[11px] text-emerald-850 font-extrabold mt-0.5">
                          Name: <span className="text-emerald-950 font-black">{matchedClient.name}</span> ({matchedClient.email})
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSlideoutLead(matchedClient);
                          setIsTimelineSlideoutOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                      >
                        View Timeline
                      </button>
                      <button
                        onClick={() => {
                          window.location.hash = `client-${encodeURIComponent(matchedClient.name)}`;
                        }}
                        className="px-3 py-1.5 bg-emerald-650 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                      >
                        Open Client
                      </button>
                    </div>
                  </div>
                )}

                {/* parsed email iframe preview */}
                <div className="flex-1 overflow-y-auto py-4">
                  {bodyObj ? (
                    <iframe 
                      className="w-full h-full border-0 rounded-2xl bg-transparent"
                      title="Parsed mail content"
                      srcDoc={`
                        <html>
                          <head>
                            <style>
                              body {
                                font-family: system-ui, -apple-system, sans-serif;
                                color: #0f172a;
                                background-color: transparent;
                                line-height: 1.6;
                                font-size: 13px;
                              }
                              a { color: #db2777; text-decoration: none; }
                              a:hover { text-decoration: underline; }
                              blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; margin: 12px 0; }
                            </style>
                          </head>
                          <body>
                            ${bodyObj.html || bodyObj.text || ''}
                          </body>
                        </html>
                      `}
                    />
                  ) : (
                    <div className="text-center text-slate-400 py-12 text-xs font-semibold">
                      No message content.
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Mail size={40} className="stroke-[1.5] text-slate-300 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select a conversation thread</span>
            </div>
          )
        )}
      </div>

      {/* COMPOSERS OVERLAY DRAWER */}
      {composers.map(comp => (
        <div key={comp.id} className={`fixed bottom-0 right-10 w-96 bg-white border-t border-x border-slate-300 rounded-t-2xl shadow-2xl z-50 flex flex-col ${comp.isClosing ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
          <div className="bg-slate-900 text-white p-3 rounded-t-2xl flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider">New Email</span>
            <button
              onClick={() => closeComposer(comp.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-3 text-left">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">To Address</label>
              <input
                type="email"
                value={comp.to}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, to: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">Subject</label>
              <input
                type="text"
                value={comp.subject}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, subject: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">Message Body</label>
              <textarea
                rows={6}
                value={comp.body}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, body: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white resize-none"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => handleSendEmail(comp)}
                disabled={isSending}
                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow"
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send Email
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* TIMELINE SLIDEOUT OVERLAY */}
      {(isTimelineSlideoutOpen || isClosingTimeline) && slideoutLead && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end ${isClosingTimeline ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="flex-1" onClick={closeTimelineSlideout} />
          
          <div className={`w-[500px] max-w-full bg-white h-full shadow-2xl flex flex-col relative ${isClosingTimeline ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="text-left">
                <span className="text-[10px] font-black uppercase text-pink-500 tracking-wider">CRM Detail Timeline</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight">{slideoutLead.name}</h3>
              </div>
              <button
                onClick={closeTimelineSlideout}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Timeline List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoadingSlideoutEmails && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                  <Loader2 className="animate-spin text-pink-500" size={20} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Loading correspondences...</span>
                </div>
              )}
              {slideoutTimelineEvents.length === 0 ? (
                <div className="text-center text-slate-400 py-12 text-xs font-semibold">
                  No activities or email records logged on timeline.
                </div>
              ) : (
                <div className="space-y-4 relative border-l-2 border-slate-150 pl-4 text-left">
                  {slideoutTimelineEvents.map((event: any) => {
                    const pmName = slideoutLead.owner || "Erik";
                    const pmColor = projectManagerColors[pmName] || "#6366f1";
                    let dotColor = "bg-blue-600 text-white border-blue-700";
                    let cardBorder = "border-slate-200 bg-slate-50/50";
                    let icon = <Clock size={12} />;

                    if (event.type === "phone") {
                      dotColor = "bg-blue-600 text-white border-blue-700";
                      icon = <Phone size={12} />;
                    } else if (event.type === "email") {
                      dotColor = "bg-indigo-650 text-white border-indigo-755";
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
                        <span className={`absolute -left-[27px] top-1 h-[22px] w-[22px] rounded-full border flex items-center justify-center shadow ${dotColor}`}>
                          {icon}
                        </span>
                        
                        <div className={`border p-3.5 rounded-2xl shadow-xs ${cardBorder}`}>
                           <div className="flex justify-between items-center border-b border-slate-200/50 pb-1 mb-1.5 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{event.title}</span>
                              {event.type === "email" ? (
                                <>
                                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 tracking-wider flex items-center gap-1">
                                    {event.isOutgoing ? "📤 Outgoing" : "📥 Incoming"}
                                  </span>
                                  <span 
                                    className="inline-flex items-center gap-1 text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-sm text-white"
                                    style={{ backgroundColor: pmColor, borderColor: pmColor }}
                                  >
                                    @ {pmName}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 tracking-wider">
                                  {event.type}
                                </span>
                              )}
                            </div>
                            <span className="text-[8px] text-slate-400 font-extrabold">{event.timestamp}</span>
                          </div>
                          {(() => {
                            const lines = event.content.split("\n");
                            const showGradient = lines.length > 5 || event.content.length > 250;
                            return (
                              <div className={`relative ${showGradient ? "max-h-[90px] overflow-hidden" : ""}`}>
                                <p className="text-[10.5px] text-slate-655 leading-[1.35] font-bold select-text whitespace-pre-wrap">
                                  {event.content}
                                </p>
                                {showGradient && (
                                  <div className="absolute bottom-0 left-0 right-0 h-[35px] bg-gradient-to-t from-slate-55 via-slate-55/70 to-transparent pointer-events-none" />
                                )}
                              </div>
                            );
                          })()}
                          {event.amount && (
                            <span className="block mt-1 text-[9px] font-black text-emerald-800 uppercase tracking-wider">
                              Worth: &euro; {event.amount.toLocaleString()}
                            </span>
                          )}
                          {event.extraTime && (
                            <span className="block mt-1 text-[9px] font-black text-rose-800 uppercase tracking-wider">
                              Time: {event.extraTime}
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
      )}
    </div>
  );
};
