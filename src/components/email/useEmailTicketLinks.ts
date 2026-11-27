import { useCallback, useEffect, useState } from "react";
import type { Ticket } from "../../types";
import {
  buildLinkedEmail,
  findLinkedTicketsForEmails,
  linkEmailToTicket,
  unlinkEmailFromTicket,
} from "../../utils/ticketEmailLinks";

interface PendingEmailLink {
  channel: string;
  uid: string;
  folder: string;
  msgid: string;
}

const parsePendingEmailLink = (): PendingEmailLink | null => {
  const hashParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const uid = hashParams.get("uid") || "";
  const msgid = hashParams.get("msgid") || "";
  if (!uid && !msgid) return null;
  return {
    channel: hashParams.get("channel") || "",
    uid,
    folder: hashParams.get("folder") || "INBOX",
    msgid,
  };
};

interface UseEmailTicketLinksOpts {
  tickets: Ticket[];
  setTickets?: React.Dispatch<React.SetStateAction<Ticket[]>>;
  canEdit: boolean;
  selectedMailboxId: string;
  setSelectedMailboxId: React.Dispatch<React.SetStateAction<string>>;
  availableAccounts: { id: string }[];
  isSelectedEmailChannel: boolean;
  isLoadingEmails: boolean;
  emails: any[];
  lastSyncAt: Date | null;
  isThreadedMode: boolean;
  setIsThreadedMode: React.Dispatch<React.SetStateAction<boolean>>;
  threadedEmails: { id: string; emails: any[] }[];
  setSelectedThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedEmailUids: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedEmail: React.Dispatch<any>;
  setThreadBodies: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setIsLoadingDetail: React.Dispatch<React.SetStateAction<boolean>>;
  expandThreadMessage: (email: any) => Promise<void>;
  activeFolder: string;
  mbParam: string;
  userEmail: string;
  notify: (message: string, tone?: "success" | "error") => void;
  t: (en: string, sk: string, hu: string) => string;
}

export function useEmailTicketLinks({
  tickets,
  setTickets,
  canEdit,
  selectedMailboxId,
  setSelectedMailboxId,
  availableAccounts,
  isSelectedEmailChannel,
  isLoadingEmails,
  emails,
  lastSyncAt,
  isThreadedMode,
  setIsThreadedMode,
  threadedEmails,
  setSelectedThreadId,
  setExpandedEmailUids,
  setSelectedEmail,
  setThreadBodies,
  setIsLoadingDetail,
  expandThreadMessage,
  activeFolder,
  mbParam,
  userEmail,
  notify,
  t,
}: UseEmailTicketLinksOpts) {
  const [pendingEmailLink, setPendingEmailLink] = useState<PendingEmailLink | null>(parsePendingEmailLink);

  useEffect(() => {
    const onHash = () => {
      const next = parsePendingEmailLink();
      if (next) setPendingEmailLink(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const getLinkedTickets = useCallback(
    (targetEmails: any[]) =>
      findLinkedTicketsForEmails(tickets, targetEmails, selectedMailboxId || "personal", activeFolder),
    [tickets, selectedMailboxId, activeFolder],
  );

  const handleLinkEmailToTicket = useCallback(
    (ticketId: string, email: any) => {
      if (!setTickets || !canEdit || !email) return;
      const link = buildLinkedEmail(email, { mailboxId: selectedMailboxId || "personal", activeFolder });
      setTickets((prev) => prev.map((tk) => (tk.id === ticketId ? linkEmailToTicket(tk, link) : tk)));
      const ticketObj = tickets.find((tk) => tk.id === ticketId);
      notify(
        t(
          `Email connected to ${ticketObj?.ticketNumber || "ticket"}.`,
          `E-mail prepojený s tiketom ${ticketObj?.ticketNumber || ""}.`,
          `E-mail összekapcsolva a(z) ${ticketObj?.ticketNumber || "jegy"} jeggyel.`,
        ),
        "success",
      );
    },
    [setTickets, canEdit, selectedMailboxId, activeFolder, tickets, notify, t],
  );

  const handleUnlinkEmailFromTicket = useCallback(
    (ticketId: string, targetEmails: any[]) => {
      if (!setTickets || !canEdit || !targetEmails.length) return;
      setTickets((prev) =>
        prev.map((tk) =>
          tk.id === ticketId
            ? unlinkEmailFromTicket(tk, {
                emails: targetEmails,
                mailboxId: selectedMailboxId || "personal",
                activeFolder,
              })
            : tk,
        ),
      );
    },
    [setTickets, canEdit, selectedMailboxId, activeFolder],
  );

  useEffect(() => {
    if (!pendingEmailLink) return;
    if (pendingEmailLink.channel && availableAccounts.length > 0) {
      const targetAcc = availableAccounts.find((a) => a.id === pendingEmailLink.channel);
      if (targetAcc && selectedMailboxId !== targetAcc.id) {
        setSelectedMailboxId(targetAcc.id);
        return;
      }
    }
    if (!isSelectedEmailChannel || isLoadingEmails) return;

    const match = emails.find((em) => {
      if (
        pendingEmailLink.msgid &&
        (em.message_id || "").trim().toLowerCase() === pendingEmailLink.msgid.trim().toLowerCase()
      ) {
        return true;
      }
      if (pendingEmailLink.uid && String(em.uid) === String(pendingEmailLink.uid)) {
        const emFolder = em.isSent ? "Sent" : activeFolder;
        if (!pendingEmailLink.folder || emFolder.toLowerCase() === pendingEmailLink.folder.toLowerCase()) return true;
      }
      return false;
    });

    if (match) {
      setPendingEmailLink(null);
      if (isThreadedMode) {
        const thread = threadedEmails.find((tr) => tr.emails.some((e: any) => e.uid === match.uid));
        if (thread) {
          setSelectedThreadId(thread.id);
          setExpandedEmailUids({ [match.uid]: true });
          void expandThreadMessage(match);
          return;
        }
        setIsThreadedMode(false);
      }
      void expandThreadMessage(match);
      return;
    }

    if (lastSyncAt && pendingEmailLink.uid) {
      const target = pendingEmailLink;
      setPendingEmailLink(null);
      const folderToUse = target.folder || "INBOX";
      void (async () => {
        setIsLoadingDetail(true);
        try {
          const res = await fetch(
            `/api/mail_broker.php?action=get_email_detail&uid=${encodeURIComponent(target.uid)}&folder=${encodeURIComponent(folderToUse)}${mbParam}`,
            { headers: { "X-User-Email": userEmail } },
          );
          const data = await res.json();
          if (data.success && data.email) {
            const syntheticEmail = {
              uid: target.uid,
              subject: data.email.subject || "(No Subject)",
              from: data.email.from || { name: "", address: "" },
              to: data.email.to || { name: "", address: "" },
              date: data.email.date || "",
              isSent: folderToUse.toLowerCase() === "sent",
              seen: true,
              message_id: target.msgid || data.email.message_id || "",
            };
            setThreadBodies((prev) => ({ ...prev, [target.uid]: data.email }));
            setIsThreadedMode(false);
            setSelectedEmail(syntheticEmail);
          }
        } catch {
          /* ignore */
        } finally {
          setIsLoadingDetail(false);
        }
      })();
    }
  }, [
    pendingEmailLink,
    availableAccounts,
    selectedMailboxId,
    isSelectedEmailChannel,
    isLoadingEmails,
    emails,
    lastSyncAt,
    isThreadedMode,
    threadedEmails,
    activeFolder,
    mbParam,
    userEmail,
  ]);

  return { getLinkedTickets, handleLinkEmailToTicket, handleUnlinkEmailFromTicket };
}
