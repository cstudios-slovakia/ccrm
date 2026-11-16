import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  BOTMAN_DRIVER_SPECS,
  backlogSummary,
  deleteMailbox,
  draftFromMailbox,
  emptyMailboxDraft,
  getBotManWebhookUrl,
  getBotManWidgetSnippet,
  inferConnectorType,
  installAgentCli,
  isAgentConnector,
  isApiKeyAgentConnector,
  isBotManConnector,
  isEmailConnector,
  isMicrosoftDraft,
  isMicrosoftMailbox,
  listMailboxes,
  registerBotManWebhook,
  runMailbox,
  runSubscriptionAgent,
  saveMailbox,
  startAgentSubscriptionLogin,
  startWhatsAppDirectQr,
  pollWhatsAppDirectQr,
  stopWhatsAppDirectQr,
  submitAgentSubscriptionCode,
  testMailbox,
  type CompanyMailbox,
  type ConnectorEnvironment,
  type ConnectorType,
  type MailboxDraft,
  type MailboxFolderState,
  type MailboxList,
} from "../utils/companyMailboxes";
import { fetchModuleConfig, fetchSsoToken } from "./whatsapp/api/crmConnection";
import { WaaiClient } from "./whatsapp/api/waaiClient";
import { SectionCard } from "./settings/SectionCard";
import { MicrosoftAppSettings } from "./MicrosoftAppSettings";
import { MicrosoftMailConnect } from "./MicrosoftMailConnect";
export { PROVIDERS, ALL_PROVIDER_TYPES, ProviderLogo, type ProviderMeta } from "./companyMailboxProviders";
import { COPY } from "./companyMailboxCopy";
import {
  ALL_PROVIDER_TYPES,
  CONNECTOR_MENU_GROUPS,
  PROVIDERS,
  ProviderLogo,
  getConnectorGroupTitle,
} from "./companyMailboxProviders";

interface Props {
  userLanguage?: "sk" | "hu" | "en";
  systemLanguage?: "sk" | "hu" | "en";
  users: { id?: string; name: string; email?: string; role?: string }[];
  showToast?: (message: string, type?: "success" | "error") => void;
}

type CategoryFilter = "all" | "email" | "whatsapp" | "agents";


export const CompanyMailboxSettings: React.FC<Props> = ({ userLanguage, systemLanguage, users, showToast }) => {
  const lang = userLanguage ?? systemLanguage ?? "en";
  const t = COPY[lang] ?? COPY.en;
  const [data, setData] = useState<MailboxList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [editing, setEditing] = useState<MailboxDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "login" | "cli" | "agent_test" | string | null>(null);
  const [formMsg, setFormMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // WhatsApp direct WAAI QR pairing state
  const [waQrModalOpen, setWaQrModalOpen] = useState(false);
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waPairingStatus, setWaPairingStatus] = useState<
    "idle" | "starting" | "pending_qr" | "authenticated" | "connected" | "error"
  >("idle");
  const [waPairingNote, setWaPairingNote] = useState<string | null>(null);
  const waStreamStopRef = useRef<(() => void) | null>(null);

  // Marveen Subscription OAuth wizard state
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [agentTestOutput, setAgentTestOutput] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [modalTypeMenuOpen, setModalTypeMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const modalTypeMenuRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listMailboxes());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return () => {
      waStreamStopRef.current?.();
    };
  }, []);

  // Close slide-up modal on Escape
  useEffect(() => {
    if (!editing && !addMenuOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (modalTypeMenuOpen) {
          setModalTypeMenuOpen(false);
          return;
        }
        if (addMenuOpen) {
          setAddMenuOpen(false);
          return;
        }
        setEditing(null);
        setWaQrModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, addMenuOpen, modalTypeMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen && !modalTypeMenuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
      }
      if (modalTypeMenuOpen && modalTypeMenuRef.current && !modalTypeMenuRef.current.contains(target)) {
        setModalTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addMenuOpen, modalTypeMenuOpen]);

  const userMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; email?: string; role?: string }>();
    for (const u of users) {
      const uid = u.id || u.name;
      m.set(uid, { ...u, id: uid });
    }
    return m;
  }, [users]);

  const connectors = useMemo(() => {
    const list = data?.mailboxes ?? [];
    return list.map((b) => ({
      ...b,
      connectorType: inferConnectorType(b.settings, b.address, b.connectorType),
      userIds:
        b.userIds && b.userIds.length > 0
          ? b.userIds
          : b.settings?.userIds && b.settings.userIds.length > 0
            ? b.settings.userIds
            : b.ownerUserId
              ? [b.ownerUserId]
              : [],
    }));
  }, [data]);

  const filteredConnectors = useMemo(() => {
    if (categoryFilter === "all") return connectors;
    return connectors.filter((c) => PROVIDERS[c.connectorType]?.category === categoryFilter);
  }, [connectors, categoryFilter]);

  const counts = useMemo(() => {
    let email = 0;
    let whatsapp = 0;
    let agents = 0;
    for (const c of connectors) {
      const cat = PROVIDERS[c.connectorType]?.category;
      if (cat === "email") email++;
      else if (cat === "whatsapp") whatsapp++;
      else if (cat === "agents") agents++;
    }
    return { all: connectors.length, email, whatsapp, agents };
  }, [connectors]);

  const setField = <K extends keyof MailboxDraft>(k: K, v: MailboxDraft[K]) =>
    setEditing((d) => (d ? { ...d, [k]: v } : d));

  const setSetting = <K extends keyof MailboxDraft["settings"]>(k: K, v: MailboxDraft["settings"][K]) =>
    setEditing((d) => (d ? { ...d, settings: { ...d.settings, [k]: v } } : d));

  const switchConnectorType = (nextType: ConnectorType) => {
    setFormMsg(null);
    setOauthUrl(null);
    setOauthCode("");
    setAgentTestOutput(null);
    setWaQrModalOpen(false);
    setEditing((prev) => {
      const fresh = emptyMailboxDraft(nextType);
      if (!prev) return fresh;
      const keepAddr = isAgentConnector(prev.connectorType) && isAgentConnector(nextType);
      return {
        ...fresh,
        id: prev.id,
        name: prev.name,
        address: keepAddr ? prev.address : fresh.address,
        userIds: prev.userIds,
        ownerUserId: prev.ownerUserId,
        isActive: prev.isActive,
      };
    });
  };

  const toggleUserId = (uid: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const exists = prev.userIds.includes(uid);
      const next = exists ? prev.userIds.filter((id) => id !== uid) : [...prev.userIds, uid];
      return {
        ...prev,
        userIds: next,
        ownerUserId: next[0] || "",
        settings: { ...prev.settings, userIds: next },
      };
    });
  };

  const cancelWhatsAppQrPairing = () => {
    waStreamStopRef.current?.();
    waStreamStopRef.current = null;
    if (editing?.settings.waAccountId) {
      void stopWhatsAppDirectQr({
        id: editing.id || undefined,
        accountId: editing.settings.waAccountId,
      }).catch(() => undefined);
    }
    setWaQrModalOpen(false);
    setWaPairingStatus("idle");
  };

  const startWhatsAppQrPairing = async () => {
    if (!editing) return;
    waStreamStopRef.current?.();
    waStreamStopRef.current = null;
    setWaQrModalOpen(true);
    setWaQrDataUrl(null);
    setWaPairingStatus("starting");
    setWaPairingNote("Connecting to WhatsApp via WAAI & requesting live multi-device QR code…");
    setFormMsg(null);

    // 1. Try external WAAI module API (/wa-accounts + /wa-accounts/:id/stream) if configured
    try {
      const cfg = await fetchModuleConfig();
      const customBase = editing.settings.waServiceUrl?.trim();
      const base = customBase
        ? customBase.startsWith("http") && !customBase.includes("/api/ccrm/v1")
          ? `${customBase.replace(/\/+$/, "")}/api/ccrm/v1`
          : customBase
        : cfg.configured
          ? cfg.base
          : null;

      if (base && cfg.configured) {
        const client = new WaaiClient({ base, fetchSsoToken: () => fetchSsoToken() });
        const started = await client.post<{ account_id: string; worker_offline: boolean }>("/wa-accounts");
        if (!started.worker_offline && started.account_id) {
          const accId = started.account_id;
          setSetting("waAccountId", accId);
          const ctrl = new AbortController();
          waStreamStopRef.current = () => ctrl.abort();

          void client
            .stream(
              `/wa-accounts/${encodeURIComponent(accId)}/stream`,
              (event) => {
                if (event.event === "qr") {
                  try {
                    const parsed = JSON.parse(event.data) as { qr?: string } | string;
                    const rawQr = typeof parsed === "string" ? parsed : parsed.qr ?? event.data;
                    const dataUrl = rawQr.startsWith("data:") ? rawQr : `data:image/png;base64,${rawQr}`;
                    setWaQrDataUrl(dataUrl);
                    setWaPairingStatus("pending_qr");
                    setWaPairingNote("Live WAAI WhatsApp QR ready — scan with WhatsApp on your phone.");
                  } catch {
                    const dataUrl = event.data.startsWith("data:")
                      ? event.data
                      : `data:image/png;base64,${event.data}`;
                    setWaQrDataUrl(dataUrl);
                    setWaPairingStatus("pending_qr");
                  }
                }
                if (event.event === "status") {
                  try {
                    const st = JSON.parse(event.data) as { status?: string; phone_number?: string; display_name?: string };
                    if (st.status === "connected") {
                      ctrl.abort();
                      setEditing((prev) =>
                        prev
                          ? {
                              ...prev,
                              name: prev.name.trim() || st.display_name || "WhatsApp (WAAI)",
                              address: prev.address.trim() || st.phone_number || `whatsapp:${accId}`,
                              settings: {
                                ...prev.settings,
                                waAccountId: accId,
                                waStatus: "connected",
                              },
                            }
                          : prev,
                      );
                      setWaPairingStatus("connected");
                      setWaQrModalOpen(false);
                      setFormMsg({ kind: "ok", text: "WhatsApp device linked and connected via WAAI." });
                    }
                  } catch {
                    /* ignore */
                  }
                }
              },
              { signal: ctrl.signal },
            )
            .catch(() => undefined);
          return;
        }
      }
    } catch {
      // External WAAI server not configured or unreachable — use CCRM's built-in WAAI Baileys QR worker
    }

    // 2. Direct WAAI Baileys Multi-Device QR Worker (wss://web.whatsapp.com/ws/chat)
    try {
      const candidateAccId =
        editing.settings.waAccountId?.trim() ||
        (editing.id ? `wa-${editing.id}` : `wa-${Date.now().toString(36)}`);

      const started = await startWhatsAppDirectQr({
        id: editing.id || undefined,
        accountId: candidateAccId,
        reset: true,
      });

      const accId = started.accountId || candidateAccId;
      setSetting("waAccountId", accId);

      if (started.qr) {
        setWaQrDataUrl(started.qr);
        setWaPairingStatus("pending_qr");
        setWaPairingNote("Live WhatsApp QR code active — point your phone camera (Linked Devices) at the QR code.");
      } else if (started.status === "connected") {
        setSetting("waStatus", "connected");
        setWaPairingStatus("connected");
        setWaQrModalOpen(false);
        setFormMsg({ kind: "ok", text: "WhatsApp account is connected via WAAI." });
        return;
      } else if (started.status === "error") {
        setWaPairingStatus("error");
        setWaPairingNote(started.error || "Failed to generate WhatsApp QR code.");
        return;
      }

      let stopped = false;
      const timer = window.setInterval(async () => {
        if (stopped) return;
        try {
          const poll = await pollWhatsAppDirectQr({
            id: editing.id || undefined,
            accountId: accId,
          });
          if (stopped) return;

          if (poll.qr) {
            setWaQrDataUrl(poll.qr);
            setWaPairingStatus("pending_qr");
            setWaPairingNote("Live WhatsApp QR code active (auto-refreshes every 20s) — scan with WhatsApp.");
          }
          if (poll.status === "authenticated") {
            setWaPairingStatus("authenticated");
            setWaPairingNote("QR code scanned on phone! Finalizing WhatsApp multi-device link…");
          }
          if (poll.status === "connected") {
            stopped = true;
            window.clearInterval(timer);
            setEditing((prev) =>
              prev
                ? {
                    ...prev,
                    name: prev.name.trim() || poll.displayName || "WhatsApp (WAAI)",
                    address:
                      !prev.address.trim() || prev.address.startsWith("whatsapp:")
                        ? poll.phone || `whatsapp:${accId}`
                        : prev.address,
                    settings: {
                      ...prev.settings,
                      waAccountId: accId,
                      waStatus: "connected",
                    },
                  }
                : prev,
            );
            setWaPairingStatus("connected");
            setWaQrModalOpen(false);
            setFormMsg({
              kind: "ok",
              text: `WhatsApp connected via WAAI${poll.phone ? ` (${poll.phone})` : ""}! Click Save Connector to finish.`,
            });
          } else if (poll.status === "error" || poll.status === "expired") {
            stopped = true;
            window.clearInterval(timer);
            setWaPairingStatus("error");
            setWaPairingNote(poll.error || "QR code expired. Click Refresh QR Code to generate a new one.");
          }
        } catch {
          // ignore transient poll network hiccup
        }
      }, 1800);

      waStreamStopRef.current = () => {
        stopped = true;
        window.clearInterval(timer);
      };
    } catch (err: unknown) {
      setWaPairingStatus("error");
      setWaPairingNote(err instanceof Error ? err.message : "Failed to start WAAI WhatsApp QR worker.");
    }
  };

  const onStartSubscriptionOAuth = async () => {
    if (!editing) return;
    setBusy("login");
    setFormMsg(null);
    try {
      const res = await startAgentSubscriptionLogin({
        id: editing.id || undefined,
        connectorType: editing.connectorType,
        agentEndpoint: editing.settings.agentEndpoint,
      });
      setOauthUrl(res.url);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onSubmitSubscriptionCode = async () => {
    if (!editing || !oauthCode.trim()) return;
    setBusy("login");
    setFormMsg(null);
    try {
      const res = await submitAgentSubscriptionCode({
        id: editing.id || undefined,
        connectorType: editing.connectorType,
        code: oauthCode.trim(),
        agentEndpoint: editing.settings.agentEndpoint,
      });
      setSetting("subscriptionToken", res.token || oauthCode.trim());
      setOauthCode("");
      setOauthUrl(null);
      setFormMsg({ kind: "ok", text: "Subscription authenticated and verified with Marveen runtime." });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onInstallCli = async (provider: ConnectorType) => {
    setBusy("cli");
    setFormMsg(null);
    try {
      const res = await installAgentCli(provider);
      if (res.environment && data) {
        setData({ ...data, environment: res.environment });
      }
      setFormMsg({ kind: "ok", text: `${PROVIDERS[provider].label} CLI binary is ready.` });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onTest = async () => {
    if (!editing) return;
    setBusy("test");
    setFormMsg(null);
    try {
      const res = await testMailbox(editing);
      setFormMsg({ kind: "ok", text: res.detail || t.testOk });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onRegisterBotManWebhook = async () => {
    if (!editing || !isBotManConnector(editing.connectorType)) return;
    setBusy("webhook");
    setFormMsg(null);
    try {
      const webhookUrl = getBotManWebhookUrl(editing.id || "draft", editing.connectorType);
      const res = await registerBotManWebhook(editing, webhookUrl);
      setSetting("botmanWebhookRegistered", true);
      setFormMsg({ kind: "ok", text: res.detail || `Webhook registered: ${webhookUrl}` });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy("save");
    setFormMsg(null);
    try {
      const savedBox = (await saveMailbox(editing)).mailbox;
      setEditing(null);
      setWaQrModalOpen(false);
      showToast?.(savedBox && isMicrosoftMailbox(savedBox) && !savedBox.connected ? t.msSavedSignIn : t.save, "success");
      await reload();
      window.dispatchEvent(new Event("ccrm:connectors-updated"));
    } catch (err: unknown) {
      setFormMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (box: CompanyMailbox) => {
    if (!window.confirm(t.confirmRemove)) return;
    setBusy(box.id);
    try {
      await deleteMailbox(box.id);
      await reload();
      window.dispatchEvent(new Event("ccrm:connectors-updated"));
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const onRunNow = async (box: CompanyMailbox) => {
    setBusy(box.id);
    try {
      const res = await runMailbox(box.id);
      const err = res.run?.errors?.[0];
      if (err) showToast?.(err, "error");
      else showToast?.(`${res.run?.filed ?? 0} ${t.filed}`, "success");
      await reload();
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const onTestSavedAgentMcp = async (box: CompanyMailbox) => {
    setBusy(box.id);
    try {
      const res = await runSubscriptionAgent({
        id: box.id,
        prompt: "Verify CCRM MCP connection and reply with OK.",
      });
      showToast?.(res.text || "Agent MCP connection verified.", "success");
      await reload();
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const renderCategoryPill = (cat: "email" | "whatsapp" | "agents") => {
    if (cat === "email") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-slate-900/5 dark:bg-white/10 text-slate-700 dark:text-slate-200">
          <Mail className="w-3 h-3 opacity-80" /> {t.catEmail}
        </span>
      );
    }
    if (cat === "whatsapp") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
          <MessageCircle className="w-3 h-3" /> {t.catWhatsapp}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-violet-500/15 text-violet-800 dark:text-violet-300">
        <Bot className="w-3 h-3" /> {t.catAgents}
      </span>
    );
  };

  const renderTechnicalSpec = (box: CompanyMailbox & { connectorType: ConnectorType }) => {
    if (box.connectorType === "gmail") {
      return "IMAP · imap.gmail.com:993 · App Password";
    }
    if (box.connectorType === "exchange") {
      return box.settings?.exchangeMode === "graph"
        ? "Microsoft 365 Graph API (OAuth2)"
        : `Exchange · ${box.settings?.imapHost || "outlook.office365.com"}`;
    }
    if (box.connectorType === "smtp") {
      return `IMAP · ${box.settings?.imapHost || "custom"}:${box.settings?.imapPort || "993"}`;
    }
    if (box.connectorType === "whatsapp") {
      return `WAAI QR Session · ${box.settings?.waAccountId || "Ready to pair"}`;
    }
    if (isBotManConnector(box.connectorType)) {
      const spec = BOTMAN_DRIVER_SPECS[box.connectorType];
      return `${spec.driverClass.replace("BotMan\\Drivers\\", "BotMan · ")} · ${spec.supportsLocalPolling ? "Webhook + Poll" : "Webhook"}`;
    }
    if (isApiKeyAgentConnector(box.connectorType) || Boolean(box.settings?.apiKey)) {
      return `Direct HTTPS API · CCRM MCP${box.settings?.agentModel ? ` · ${box.settings.agentModel}` : ""}`;
    }
    return `Subscription OAuth · CCRM MCP${box.settings?.agentModel ? ` · ${box.settings.agentModel}` : ""}`;
  };

  const renderStatusPill = (box: CompanyMailbox & { connectorType: ConnectorType }) => {
    const folders = box.folders ?? [];
    const folderErr = folders.find((f) => f.lastError)?.lastError;
    const err = box.lastError || folderErr;
    if (err) {
      return (
        <span
          data-testid="company-mailbox-error"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-micro font-semibold text-rose-600 dark:text-rose-400"
          title={err}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[24ch]">{err}</span>
        </span>
      );
    }

    if (box.connectorType === "whatsapp") {
      const connected = box.settings?.waStatus === "connected" || Boolean(box.settings?.waAccountId);
      return connected ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t.waConnectedBadge}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <QrCode className="w-3.5 h-3.5" /> {t.waQrRequiredBadge}
        </span>
      );
    }

    if (isBotManConnector(box.connectorType)) {
      const ready =
        box.connectorType === "webchat" ||
        box.connectorType === "messenger" ||
        Boolean(box.settings?.botmanToken || box.settings?.botmanAppId);
      return ready ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> BotMan Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <KeyRound className="w-3.5 h-3.5" /> Token Needed
        </span>
      );
    }

    if (isAgentConnector(box.connectorType)) {
      const hasToken = Boolean(box.settings?.subscriptionToken || box.settings?.apiKey);
      const isApiMode = isApiKeyAgentConnector(box.connectorType);
      const readyLabel = isApiMode
        ? lang === "sk"
          ? "API kľúč aktívny"
          : lang === "hu"
            ? "API kulcs aktív"
            : "API Key Ready"
        : t.agentReadyBadge;
      return hasToken ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <Sparkles className="w-3.5 h-3.5" /> {readyLabel}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <KeyRound className="w-3.5 h-3.5" /> {t.agentSetupNeededBadge}
        </span>
      );
    }

    const s = backlogSummary(folders);
    if (!s.started) {
      return <span className="text-micro text-slate-400">{t.idle}</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-micro text-slate-700 dark:text-slate-300">
        {s.caughtUp ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
        )}
        <span>{s.caughtUp ? t.caughtUp : t.backfilling}</span>
        <span className="text-slate-400">
          · {s.filed} {t.filed}
        </span>
      </span>
    );
  };

  const renderEnvBadge = (env?: ConnectorEnvironment) => {
    if (!env) return null;
    const label =
      env.mode === "local_cli"
        ? t.envLocalCli
        : env.mode === "remote_bridge"
          ? t.envRemoteBridge
          : t.envCloudMcp;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
        <Terminal className="w-3 h-3 text-indigo-500" />
        {label}
      </span>
    );
  };

  const inp =
    "mt-1 w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-ui text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-normal";
  const lbl = "block type-overline text-slate-600 dark:text-slate-300";

  const activeMeta = editing ? PROVIDERS[editing.connectorType] ?? PROVIDERS.smtp : PROVIDERS.smtp;

  return (
    <div className="space-y-4" data-testid="company-mailboxes">
      <SectionCard
        title={t.title}
        description={t.subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {renderEnvBadge(data?.environment)}
            <button
              type="button"
              onClick={() => {
                setFormMsg(null);
                setEditing(emptyMailboxDraft("smtp"));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-caption font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t.add}
            </button>
          </div>
        }
      >
        {data && data.imapAvailable === false && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-caption">
            <AlertCircle className="w-4 h-4 shrink-0" /> {t.noImap}
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-caption">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="mb-4">
          <MicrosoftAppSettings language={lang} onChanged={() => void reload()} />
        </div>

        {/* Filter Bar & Add Connection Dropdown */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: `${t.filterAll} (${counts.all})` },
                { id: "email", label: `${t.filterEmail} (${counts.email})` },
                { id: "whatsapp", label: `${t.filterWhatsapp} (${counts.whatsapp})` },
                { id: "agents", label: `${t.filterAgents} (${counts.agents})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-micro font-semibold transition-colors ${
                  categoryFilter === tab.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              data-testid="add-connector-dropdown-btn"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-caption font-semibold text-slate-800 dark:text-slate-100 shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t.add}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${addMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {addMenuOpen && (
              <div
                data-testid="add-connector-dropdown-menu"
                className="absolute right-0 mt-1.5 w-72 max-h-[34rem] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-xl z-50 p-1.5 space-y-1.5"
              >
                {CONNECTOR_MENU_GROUPS.map((group) => {
                  const items = ALL_PROVIDER_TYPES.filter(group.filter);
                  return (
                    <div key={group.key}>
                      <div className="px-2.5 py-1 text-micro font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {getConnectorGroupTitle(group.key, t)}
                      </div>
                      <div className="space-y-0.5">
                        {items.map((pType) => {
                          const meta = PROVIDERS[pType];
                          return (
                            <button
                              key={pType}
                              type="button"
                              data-testid={`quick-add-${pType}`}
                              onClick={() => {
                                setAddMenuOpen(false);
                                setFormMsg(null);
                                setEditing(emptyMailboxDraft(pType));
                              }}
                              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                            >
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}
                              >
                                <ProviderLogo type={pType} className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-caption font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {meta.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Unified Color-Coded Connector List with High Visual Distinction */}
        {loading && !data ? (
          <div className="py-6 flex items-center justify-center text-slate-400 text-caption gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : filteredConnectors.length === 0 ? (
          <p className="text-caption text-slate-500 dark:text-slate-400 py-3">{t.none}</p>
        ) : (
          <div className="space-y-2.5">
            {filteredConnectors.map((box) => {
              const meta = PROVIDERS[box.connectorType] ?? PROVIDERS.smtp;
              const assignedUsers = box.userIds
                .map((uid) => userMap.get(uid))
                .filter((u): u is NonNullable<typeof u> => Boolean(u));

              return (
                <div
                  key={box.id}
                  data-testid={`company-mailbox-${box.id}`}
                  className={`p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 ${meta.rowBorder} ${meta.rowBg} ${meta.rowTint} flex flex-wrap items-center justify-between gap-3 transition-all shadow-2xs`}
                >
                  {/* Left: Distinct Logo + Category Pill + Provider Pill + Name + Spec + Users */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}
                      title={meta.label}
                    >
                      <ProviderLogo type={box.connectorType} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      {/* Top badge strip: Category + Provider + Technical Spec */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderCategoryPill(meta.category)}
                        <span className={`px-2 py-0.5 rounded-md text-micro font-bold ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                        <span className="text-micro text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
                          {renderTechnicalSpec(box)}
                        </span>
                      </div>

                      {/* Main Title & Account Handle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-bold text-slate-900 dark:text-white truncate">
                          {box.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900/5 dark:bg-white/5 text-caption text-slate-600 dark:text-slate-300 font-mono truncate">
                          {box.address}
                        </span>
                        {!box.isActive && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {t.paused}
                          </span>
                        )}
                        {isMicrosoftMailbox(box) && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-semibold border border-sky-200 bg-sky-50 text-sky-700">
                            Microsoft 365
                          </span>
                        )}
                      </div>

                      {isMicrosoftMailbox(box) && (
                        <div className="flex flex-wrap items-center gap-3" data-testid="company-mailbox-microsoft">
                          {box.connected ? (
                            <span className="text-caption text-slate-600 dark:text-slate-300">
                              {t.msSignedInAs} <strong className="text-slate-800 dark:text-slate-100">{box.account}</strong>
                            </span>
                          ) : (
                            <span role="alert" className="text-caption font-semibold text-amber-800 dark:text-amber-300">
                              {box.account ? t.msExpired : t.msNotSignedIn}
                            </span>
                          )}
                          <MicrosoftMailConnect
                            language={lang}
                            target={{ kind: "company", mailboxId: box.id }}
                            again={!!box.connected}
                            onSignedIn={() => void reload()}
                            className="flex flex-wrap items-center gap-3"
                          />
                        </div>
                      )}

                      {/* Assigned Users Chips */}
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {assignedUsers.length === 0 ? (
                          <span className="text-micro text-slate-400">{t.allAdminsDefault}</span>
                        ) : (
                          assignedUsers.map((u) => (
                            <span
                              key={u.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              {u.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status + Context Actions */}
                  <div className="flex items-center gap-3">
                    {renderStatusPill(box)}
                    <div className="flex items-center gap-1">
                      {isEmailConnector(box.connectorType) && (
                        <button
                          type="button"
                          onClick={() => onRunNow(box)}
                          disabled={busy === box.id}
                          title={t.fileNow}
                          className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-white/80 dark:hover:bg-slate-800 disabled:opacity-40"
                        >
                          {busy === box.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {box.connectorType === "whatsapp" && (
                        <button
                          type="button"
                          onClick={() => {
                            const d = draftFromMailbox(box);
                            setEditing(d);
                            setTimeout(() => void startWhatsAppQrPairing(), 50);
                          }}
                          title={t.waScanBtn}
                          className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-500/15"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      {isAgentConnector(box.connectorType) && (
                        <button
                          type="button"
                          onClick={() => onTestSavedAgentMcp(box)}
                          disabled={busy === box.id}
                          title={t.agentTestPromptBtn}
                          className="p-2 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 disabled:opacity-40"
                        >
                          {busy === box.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setFormMsg(null);
                          setEditing(draftFromMailbox(box));
                        }}
                        title={t.edit}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(box)}
                        disabled={busy === box.id}
                        title={t.remove}
                        className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Personal Mailboxes Filing Status Footer */}
        {data && Array.isArray(data.userMailboxes) && data.userMailboxes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            <div className="type-overline text-slate-500 dark:text-slate-400 mb-2">
              {t.personalHeading}
            </div>
            <div className="space-y-1.5">
              {data.userMailboxes.map((u) => {
                const uFolders = u.folders ?? [];
                const err = uFolders.find((f: MailboxFolderState) => f.lastError)?.lastError;
                const s = backlogSummary(uFolders);
                return (
                  <div key={u.id} className="flex items-center justify-between text-caption">
                    <span className="text-slate-700 dark:text-slate-300">
                      {u.name} <span className="text-slate-400 font-mono">({u.email})</span>
                    </span>
                    {err ? (
                      <span
                        className="inline-flex items-center gap-1 text-micro text-rose-600 dark:text-rose-400"
                        title={err}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[28ch]">{err}</span>
                      </span>
                    ) : (
                      <span className="text-micro text-slate-500">
                        {s.caughtUp ? t.caughtUp : t.backfilling} · {s.filed} {t.filed}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Color-Coded Bottom Slide-Up Popup Modal for Creating / Editing Credentials */}
      {editing && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditing(null);
              setWaQrModalOpen(false);
            }
          }}
        >
          <form
            data-testid="company-mailbox-form"
            onSubmit={onSave}
            className={`w-full max-w-4xl max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 ${activeMeta.modalBorder} overflow-hidden animate-slide-up`}
          >
            {/* Color-Coded Modal Header */}
            <div className={`shrink-0 px-6 py-4 flex items-center justify-between gap-3 ${activeMeta.modalHeaderBg}`}>
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${activeMeta.iconBg}`}>
                  <ProviderLogo type={editing.connectorType} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderCategoryPill(activeMeta.category)}
                    <span className={`px-2 py-0.5 rounded-md text-micro font-bold ${activeMeta.badgeClass}`}>
                      {activeMeta.label}
                    </span>
                  </div>
                  <h3 className="text-body font-bold text-slate-900 dark:text-white truncate mt-0.5">
                    {editing.id
                      ? `${t.edit}: ${editing.name || editing.address}`
                      : `${t.add} — ${activeMeta.label}`}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setWaQrModalOpen(false);
                }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-6 min-h-0 overflow-y-auto space-y-5 flex-1">
              {/* Connector Type Dropdown Selector */}
              <div className="relative" ref={modalTypeMenuRef}>
                <span className={lbl}>{t.connectorTypeLabel}</span>
                <button
                  type="button"
                  data-testid="modal-connector-type-dropdown"
                  onClick={() => setModalTypeMenuOpen((v) => !v)}
                  className="mt-1.5 w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-left transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${activeMeta.iconBg}`}>
                      <ProviderLogo type={editing.connectorType} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className="text-ui font-bold text-slate-900 dark:text-white truncate">
                        {activeMeta.label}
                      </span>
                      {renderCategoryPill(activeMeta.category)}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${modalTypeMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {modalTypeMenuOpen && (
                  <div
                    data-testid="modal-connector-type-menu"
                    className="absolute left-0 right-0 mt-1.5 max-h-[34rem] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-2xl z-50 p-2 space-y-2"
                  >
                    {CONNECTOR_MENU_GROUPS.map((group) => {
                      const items = ALL_PROVIDER_TYPES.filter(group.filter);
                      return (
                        <div key={group.key}>
                          <div className="px-2.5 py-1 text-micro font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {getConnectorGroupTitle(group.key, t)}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {items.map((pType) => {
                              const meta = PROVIDERS[pType];
                              const selected = editing.connectorType === pType;
                              return (
                                <button
                                  key={pType}
                                  type="button"
                                  data-testid={`connector-type-${pType}`}
                                  onClick={() => {
                                    setModalTypeMenuOpen(false);
                                    switchConnectorType(pType);
                                  }}
                                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                                    selected
                                      ? `${meta.badgeClass} ${meta.accentRing}`
                                      : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}
                                    >
                                      <ProviderLogo type={pType} className="w-4 h-4" />
                                    </div>
                                    <span className="text-caption font-semibold truncate">{meta.label}</span>
                                  </div>
                                  {selected && <Check className="w-4 h-4 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Common Identity Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>
                    {t.name}
                    <input
                      className={inp}
                      autoComplete="off"
                      value={editing.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder={t.namePlaceholder}
                      required
                    />
                  </label>
                </div>
                <div>
                  <label className={lbl}>
                    {t.address}
                    <input
                      className={inp}
                      autoComplete="off"
                      type={isEmailConnector(editing.connectorType) ? "email" : "text"}
                      value={editing.address}
                      onChange={(e) => {
                        const addr = e.target.value;
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                address: addr,
                                settings: {
                                  ...d.settings,
                                  imapUsername: d.settings.imapUsername || addr,
                                },
                              }
                            : d,
                        );
                      }}
                      placeholder={
                        isEmailConnector(editing.connectorType)
                          ? t.addressEmailPlaceholder
                          : editing.connectorType === "whatsapp"
                            ? t.addressPhonePlaceholder
                            : t.addressHandlePlaceholder
                      }
                      required={isEmailConnector(editing.connectorType)}
                    />
                  </label>
                </div>
                {isEmailConnector(editing.connectorType) && (
                  <div>
                    <label className={lbl}>
                      {t.since}
                      <input
                        className={inp}
                        type="date"
                        value={editing.backfillSince}
                        onChange={(e) => setField("backfillSince", e.target.value)}
                      />
                    </label>
                    <p className="text-micro text-slate-400 mt-0.5">{t.sinceHint}</p>
                  </div>
                )}
              </div>

              {/* Multi-User Assignment Picker (`userIds[]`) */}
              <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="type-label text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-500" />
                      {t.usersLabel} ({editing.userIds.length})
                    </div>
                    <p className="text-micro text-slate-500 dark:text-slate-400">{t.usersHint}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = users.map((u) => u.id || u.name).filter(Boolean);
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                userIds: allIds,
                                ownerUserId: allIds[0] || "",
                                settings: { ...d.settings, userIds: allIds },
                              }
                            : d,
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg text-micro font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                    >
                      {t.selectAllUsers}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                userIds: [],
                                ownerUserId: "",
                                settings: { ...d.settings, userIds: [] },
                              }
                            : d,
                        )
                      }
                      className="px-2.5 py-1 rounded-lg text-micro font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100"
                    >
                      {t.clearUsers}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {users.map((u) => {
                    const uid = u.id || u.name;
                    const selected = editing.userIds.includes(uid);
                    return (
                      <button
                        key={uid}
                        type="button"
                        data-testid={`assign-user-${uid}`}
                        onClick={() => toggleUserId(uid)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold border transition-all ${
                          selected
                            ? `${activeMeta.accentBtn} border-transparent shadow-2xs`
                            : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        <span>{u.name}</span>
                        {u.role && <span className="text-micro opacity-75">({u.role})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1. GMAIL FORM */}
              {editing.connectorType === "gmail" && (
                <div className="p-4 rounded-2xl bg-rose-500/[0.05] border border-rose-500/25 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-label text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                      <Mail className="w-4 h-4" /> Gmail App Password Setup
                    </span>
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-micro font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Google App Passwords <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-micro text-slate-600 dark:text-slate-300">{t.gmailHint}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>
                        {t.login}
                        <input
                          className={inp}
                          value={editing.settings.imapUsername || editing.address}
                          onChange={(e) => {
                            setSetting("imapUsername", e.target.value);
                            setSetting("smtpUsername", e.target.value);
                          }}
                          placeholder="you@gmail.com"
                        />
                      </label>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.appPassword}
                        <input
                          className={inp}
                          type="password"
                          value={editing.settings.imapPassword}
                          onChange={(e) => {
                            setSetting("imapPassword", e.target.value);
                            setSetting("smtpPassword", e.target.value);
                          }}
                          placeholder={editing.id ? t.passwordKeep : "xxxx xxxx xxxx xxxx"}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SMTP / IMAP FORM */}
              {editing.connectorType === "smtp" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-sky-500/[0.04] dark:bg-slate-800/40 border border-sky-500/20">
                    <div className="type-label text-sky-700 dark:text-sky-300">{t.incoming}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className={lbl}>
                          {t.imapHost}
                          <input
                            className={inp}
                            value={editing.settings.imapHost}
                            onChange={(e) => setSetting("imapHost", e.target.value)}
                            placeholder="imap.domain.tld"
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.port}
                          <input
                            className={inp}
                            value={editing.settings.imapPort}
                            onChange={(e) => setSetting("imapPort", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={lbl}>
                          {t.security}
                          <select
                            className={inp}
                            value={editing.settings.imapSecure}
                            onChange={(e) => setSetting("imapSecure", e.target.value as "ssl" | "tls" | "none")}
                          >
                            <option value="ssl">SSL/TLS</option>
                            <option value="tls">STARTTLS</option>
                            <option value="none">None</option>
                          </select>
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.login}
                          <input
                            className={inp}
                            value={editing.settings.imapUsername}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((d) =>
                                d
                                  ? {
                                      ...d,
                                      settings: {
                                        ...d.settings,
                                        imapUsername: v,
                                        smtpUsername:
                                          !d.settings.smtpUsername || d.settings.smtpUsername === d.settings.imapUsername
                                            ? v
                                            : d.settings.smtpUsername,
                                      },
                                    }
                                  : d,
                              );
                            }}
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.password}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.imapPassword}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((d) =>
                                d
                                  ? {
                                      ...d,
                                      settings: {
                                        ...d.settings,
                                        imapPassword: v,
                                        smtpPassword:
                                          d.settings.smtpPassword === d.settings.imapPassword
                                            ? v
                                            : d.settings.smtpPassword,
                                      },
                                    }
                                  : d,
                              );
                            }}
                            placeholder={editing.id ? t.passwordKeep : ""}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-sky-500/[0.04] dark:bg-slate-800/40 border border-sky-500/20">
                    <div className="type-label text-sky-700 dark:text-sky-300">{t.outgoing}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className={lbl}>
                          {t.smtpHost}
                          <input
                            className={inp}
                            value={editing.settings.smtpHost}
                            onChange={(e) => setSetting("smtpHost", e.target.value)}
                            placeholder="smtp.domain.tld"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.port}
                          <input
                            className={inp}
                            value={editing.settings.smtpPort}
                            onChange={(e) => setSetting("smtpPort", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.security}
                        <select
                          className={inp}
                          value={editing.settings.smtpSecure}
                          onChange={(e) => setSetting("smtpSecure", e.target.value as "ssl" | "tls" | "none")}
                        >
                          <option value="ssl">SSL/TLS</option>
                          <option value="tls">STARTTLS</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. MS EXCHANGE FORM */}
              {editing.connectorType === "exchange" && (
                <div className="p-4 rounded-2xl bg-blue-600/[0.05] border border-blue-600/25 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-label text-blue-700 dark:text-blue-300">{t.exchangeModeLabel}</span>
                    <div className="flex items-center gap-1.5">
                      {(["imap", "graph", "signin"] as const).map((m) => {
                        // "signin" is the Microsoft 365 sign-in (provider "microsoft365"); the other two keep provider "exchange".
                        const active = isMicrosoftDraft(editing)
                          ? m === "signin"
                          : m !== "signin" && (editing.settings.exchangeMode ?? "imap") === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            data-testid={`exchange-mode-${m}`}
                            onClick={() => {
                              if (m === "signin") {
                                setSetting("provider", "microsoft365");
                              } else {
                                setSetting("provider", "exchange");
                                setSetting("exchangeMode", m);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-micro font-semibold ${
                              active
                                ? "bg-blue-600 text-white"
                                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {m === "imap" ? t.exchangeModeImap : m === "graph" ? t.exchangeModeGraph : t.exchangeModeSignIn}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isMicrosoftDraft(editing) ? (
                    <p className="text-caption text-slate-600 dark:text-slate-300" data-testid="company-mailbox-microsoft-hint">
                      {t.msHint}
                    </p>
                  ) : (editing.settings.exchangeMode ?? "imap") === "graph" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={lbl}>
                          {t.tenantId}
                          <input
                            className={inp}
                            value={editing.settings.graphTenantId || ""}
                            onChange={(e) => setSetting("graphTenantId", e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.clientId}
                          <input
                            className={inp}
                            value={editing.settings.graphClientId || ""}
                            onChange={(e) => setSetting("graphClientId", e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.clientSecret}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.graphClientSecret || ""}
                            onChange={(e) => setSetting("graphClientSecret", e.target.value)}
                            placeholder={editing.id ? t.passwordKeep : "Client secret value"}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={lbl}>
                          {t.exchangeUrlLabel}
                          <input
                            className={inp}
                            value={editing.settings.exchangeUrl}
                            onChange={(e) => setSetting("exchangeUrl", e.target.value)}
                            placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.login}
                          <input
                            className={inp}
                            value={editing.settings.imapUsername || editing.address}
                            onChange={(e) => {
                              setSetting("imapUsername", e.target.value);
                              setSetting("smtpUsername", e.target.value);
                            }}
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.password}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.imapPassword}
                            onChange={(e) => {
                              setSetting("imapPassword", e.target.value);
                              setSetting("smtpPassword", e.target.value);
                            }}
                            placeholder={editing.id ? t.passwordKeep : ""}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. WHATSAPP (WAAI QR CODE) FORM */}
              {editing.connectorType === "whatsapp" && (
                <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="type-label text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" /> {t.waSectionTitle}
                        {editing.settings.waStatus === "connected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-micro font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t.waConnectedBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-micro text-slate-600 dark:text-slate-300 mt-0.5">{t.waSectionDesc}</p>
                    </div>
                    <button
                      type="button"
                      data-testid="whatsapp-scan-qr-btn"
                      onClick={() => void startWhatsAppQrPairing()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold shadow-xs"
                    >
                      <QrCode className="w-4 h-4" />
                      {editing.settings.waStatus === "connected" ? t.waRescanBtn : t.waScanBtn}
                    </button>
                  </div>

                  {waQrModalOpen && (
                    <div
                      data-testid="whatsapp-qr-panel"
                      className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row items-center gap-4"
                    >
                      <div className="shrink-0">
                        {waQrDataUrl ? (
                          <img
                            src={waQrDataUrl}
                            alt="WhatsApp QR Code"
                            className="w-52 h-52 rounded-xl border border-slate-200 p-2 bg-white shadow-xs"
                          />
                        ) : (
                          <div className="w-52 h-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center p-4 text-center gap-2">
                            {waPairingStatus === "error" ? (
                              <>
                                <AlertCircle className="w-7 h-7 text-rose-500" />
                                <span className="text-micro text-rose-600 dark:text-rose-400">
                                  {waPairingNote || "QR code unavailable"}
                                </span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                                <span className="text-micro text-slate-600 dark:text-slate-300">
                                  {waPairingStatus === "authenticated"
                                    ? "Completing WhatsApp handshake…"
                                    : "Requesting live WhatsApp QR code from WAAI…"}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-center sm:text-left">
                        <div className="text-ui font-semibold text-slate-900 dark:text-white">
                          Scan with WhatsApp on your phone
                        </div>
                        <ol className="text-caption text-slate-600 dark:text-slate-300 list-decimal list-inside space-y-1">
                          <li>Open WhatsApp on your phone</li>
                          <li>Tap Menu / Settings → Linked Devices</li>
                          <li>Tap Link a Device and point your camera at this QR code</li>
                        </ol>
                        {waPairingNote && (
                          <div className="flex items-center gap-1.5 text-micro text-emerald-700 dark:text-emerald-300 font-medium pt-0.5">
                            {waPairingStatus === "authenticated" || waPairingStatus === "starting" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{waPairingNote}</span>
                          </div>
                        )}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="whatsapp-refresh-qr-btn"
                            onClick={() => void startWhatsAppQrPairing()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh QR Code
                          </button>
                          <button
                            type="button"
                            onClick={cancelWhatsAppQrPairing}
                            className="px-2.5 py-1.5 rounded-lg text-caption text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>
                      {t.waServiceUrlLabel}
                      <input
                        className={inp}
                        value={editing.settings.waServiceUrl || ""}
                        onChange={(e) => setSetting("waServiceUrl", e.target.value)}
                        placeholder="/waai-api (default same-domain proxy)"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* 4b. BOTMAN MULTI-CHANNEL DRIVERS (TELEGRAM / MESSENGER / SLACK / DISCORD / TEAMS / VIBER / TWILIO / WEBCHAT) */}
              {isBotManConnector(editing.connectorType) && (() => {
                const bmSpec = BOTMAN_DRIVER_SPECS[editing.connectorType];
                const webhookUrl = getBotManWebhookUrl(editing.id || "NEW_ID", editing.connectorType);
                const widgetSnippet = bmSpec.isWebWidget ? getBotManWidgetSnippet(editing.id || "NEW_ID") : null;
                return (
                  <div
                    data-testid={`botman-setup-${editing.connectorType}`}
                    className={`p-4 rounded-2xl border space-y-4 ${activeMeta.badgeClass}`}
                  >
                    {/* Header + Official Developer Portal Link */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="type-label text-slate-900 dark:text-white flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          <span>{activeMeta.label} — BotMan Setup Guide</span>
                          <span className="px-2 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 font-mono text-micro">
                            {bmSpec.driverClass}
                          </span>
                        </div>
                        <p className="text-micro text-slate-600 dark:text-slate-300 mt-1">
                          {bmSpec.summary[lang] ?? bmSpec.summary.en}
                        </p>
                      </div>
                      <a
                        href={bmSpec.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-micro font-bold shadow-2xs ${activeMeta.accentBtn}`}
                      >
                        <span>{bmSpec.portalLabel}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* User-Friendly Step-by-Step Setup Instructions */}
                    <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="type-overline text-slate-700 dark:text-slate-200">
                        {lang === "sk"
                          ? "Ako nastaviť tento konektor (Krok za krokom)"
                          : lang === "hu"
                            ? "Beállítás lépésről lépésre"
                            : "How to Set Up (Step-by-Step Guide)"}
                      </div>
                      <ol className="list-decimal list-inside space-y-2 text-caption text-slate-700 dark:text-slate-200">
                        {(bmSpec.setupSteps[lang] ?? bmSpec.setupSteps.en).map((stepText, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {stepText.replace(/^\d+\.\s*/, "")}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Dynamic BotMan Driver Credential Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {bmSpec.fields.map((f) => (
                        <div key={f.key} className={bmSpec.fields.length === 1 ? "sm:col-span-2" : ""}>
                          <label className={lbl}>
                            {f.label[lang] ?? f.label.en}
                            <input
                              className={inp}
                              type={f.secret ? "password" : "text"}
                              autoComplete={f.secret ? "new-password" : "off"}
                              value={(editing.settings[f.key] as string) || ""}
                              onChange={(e) => setSetting(f.key, e.target.value)}
                              placeholder={editing.id && f.secret ? t.passwordKeep : f.placeholder}
                              required={Boolean(f.required && !editing.id)}
                            />
                          </label>
                          {f.hint && (
                            <p className="mt-1 text-micro text-slate-500 dark:text-slate-400 leading-snug">
                              {f.hint[lang] ?? f.hint.en}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Copyable Webhook URL / Web Widget Embed Snippet + 1-Click Webhook Registration */}
                    <div className="p-3 rounded-xl bg-slate-900/5 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="type-overline text-slate-500 dark:text-slate-400">
                            {widgetSnippet ? "Embeddable Website <script> Snippet" : "CCRM BotMan Webhook Callback URL"}
                          </div>
                          <code className="block font-mono text-micro text-slate-800 dark:text-slate-200 truncate mt-0.5">
                            {widgetSnippet || webhookUrl}
                          </code>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(widgetSnippet || webhookUrl);
                              setCopiedKey(true);
                              setTimeout(() => setCopiedKey(false), 1800);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-micro font-semibold"
                          >
                            {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{widgetSnippet ? "Copy <script>" : "Copy Webhook URL"}</span>
                          </button>
                          {bmSpec.supportsAutoWebhook && (
                            <button
                              type="button"
                              onClick={() => void onRegisterBotManWebhook()}
                              disabled={busy !== null}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-micro font-bold disabled:opacity-40 ${activeMeta.accentBtn}`}
                            >
                              {busy === "webhook" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>Register Webhook</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {!widgetSnippet && (
                        <p className="text-micro text-slate-500 dark:text-slate-400 leading-snug">
                          {bmSpec.supportsLocalPolling
                            ? "Localhost Ready: Even without a public HTTPS webhook, CCRM automatically syncs messages via API polling once your token is saved. For instant push webhooks on localhost, expose port 8085 via ngrok/Cloudflare Tunnel."
                            : "Note: External cloud webhooks require a public HTTPS URL (e.g. your production domain or an ngrok tunnel to localhost:8085)."}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 5, 6, 7. AI AGENTS (SUBSCRIPTION OR DIRECT API KEY via PURE PHP HTTPS + CCRM MCP) */}
              {isAgentConnector(editing.connectorType) && (() => {
                const isApiMode = isApiKeyAgentConnector(editing.connectorType);
                const subPair: Record<ConnectorType, ConnectorType> = {
                  claude: "claude",
                  claude_api: "claude",
                  antigravity: "antigravity",
                  gemini_api: "antigravity",
                  chatgpt: "chatgpt",
                  openai_api: "chatgpt",
                } as Record<ConnectorType, ConnectorType>;
                const apiPair: Record<ConnectorType, ConnectorType> = {
                  claude: "claude_api",
                  claude_api: "claude_api",
                  antigravity: "gemini_api",
                  gemini_api: "gemini_api",
                  chatgpt: "openai_api",
                  openai_api: "openai_api",
                } as Record<ConnectorType, ConnectorType>;
                const targetSubType = subPair[editing.connectorType] ?? "claude";
                const targetApiType = apiPair[editing.connectorType] ?? "claude_api";
                const apiKeyPortal =
                  targetApiType === "claude_api"
                    ? { url: "https://console.anthropic.com/settings/keys", name: "Anthropic Console", placeholder: "sk-ant-api03-…", modelPlaceholder: "claude-sonnet-4-5" }
                    : targetApiType === "gemini_api"
                      ? { url: "https://aistudio.google.com/app/apikey", name: "Google AI Studio", placeholder: "AIzaSy…", modelPlaceholder: "gemini-2.5-flash" }
                      : { url: "https://platform.openai.com/api-keys", name: "OpenAI Platform", placeholder: "sk-proj-…", modelPlaceholder: "gpt-4o" };

                return (
                  <div className={`p-4 rounded-2xl border space-y-3 ${activeMeta.badgeClass}`}>
                    {/* Auth Mode Switcher: Subscription CLI/OAuth vs Universal API Key */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/10">
                      <div className="inline-flex rounded-xl bg-white/80 dark:bg-slate-900/80 p-1 border border-slate-200/80 dark:border-slate-700">
                        <button
                          type="button"
                          data-testid="agent-mode-subscription-btn"
                          onClick={() => switchConnectorType(targetSubType)}
                          className={`px-3 py-1 rounded-lg text-micro font-bold transition-colors ${
                            !isApiMode
                              ? `${activeMeta.accentBtn} shadow-2xs`
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {lang === "sk"
                            ? "Predplatné (OAuth / CLI)"
                            : lang === "hu"
                              ? "Előfizetés (OAuth / CLI)"
                              : "Subscription (CLI / OAuth)"}
                        </button>
                        <button
                          type="button"
                          data-testid="agent-mode-apikey-btn"
                          onClick={() => switchConnectorType(targetApiType)}
                          className={`px-3 py-1 rounded-lg text-micro font-bold transition-colors ${
                            isApiMode
                              ? `${activeMeta.accentBtn} shadow-2xs`
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {lang === "sk"
                            ? "API Kľúč (Všetky hostingy)"
                            : lang === "hu"
                              ? "API kulcs (Minden tárhely)"
                              : "API Key (All Hostings)"}
                        </button>
                      </div>

                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700 text-micro font-semibold text-slate-700 dark:text-slate-200">
                        <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                        {isApiMode
                          ? lang === "sk"
                            ? "Univerzálny hosting · Priame HTTPS REST"
                            : lang === "hu"
                              ? "Univerzális tárhely · Közvetlen HTTPS REST"
                              : "Universal Hosting · Pure HTTPS REST"
                          : t.envLocalCli}
                      </span>
                    </div>

                    {isApiMode ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="type-label text-slate-900 dark:text-white flex items-center gap-1.5">
                              <KeyRound className="w-4 h-4" />{" "}
                              {lang === "sk"
                                ? "Priame HTTPS API pripojenie (Funguje na každom hostingu + CCRM MCP)"
                                : lang === "hu"
                                  ? "Közvetlen HTTPS API kapcsolat (Minden tárhelyen működik + CCRM MCP)"
                                  : "Direct HTTPS API Key (Works on All Hostings + CCRM MCP)"}
                            </div>
                            <p className="text-micro text-slate-600 dark:text-slate-300 mt-0.5">
                              {lang === "sk"
                                ? "Komunikuje priamo cez PHP HTTPS (cURL) bez potreby CLI, Node.js alebo proc_open. Podporuje plné volanie CCRM MCP nástrojov, subagentov a spúšťačov."
                                : lang === "hu"
                                  ? "Közvetlen PHP HTTPS (cURL) kapcsolaton fut CLI, Node.js és proc_open nélkül. Teljes CCRM MCP eszköz-, alügynök- és indító-támogatással."
                                  : "Runs via pure PHP HTTPS (cURL) with zero CLI, Node.js, or proc_open requirements. Supports full CCRM MCP tool calling, subagents, triggers, and follow-ups on any shared or cloud hosting."}
                            </p>
                          </div>
                          <a
                            href={apiKeyPortal.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-semibold shadow-2xs ${activeMeta.accentBtn}`}
                          >
                            <span>
                              {lang === "sk"
                                ? `Získať kľúč (${apiKeyPortal.name})`
                                : lang === "hu"
                                  ? `Kulcs igénylése (${apiKeyPortal.name})`
                                  : `Get Key (${apiKeyPortal.name})`}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className={lbl}>
                              {lang === "sk"
                                ? "API Kľúč"
                                : lang === "hu"
                                  ? "API kulcs"
                                  : "API Key"}
                              <input
                                className={inp}
                                type="password"
                                data-testid="agent-api-key-input"
                                autoComplete="new-password"
                                value={editing.settings.apiKey || editing.settings.subscriptionToken || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((d) =>
                                    d
                                      ? {
                                          ...d,
                                          settings: {
                                            ...d.settings,
                                            apiKey: v,
                                            subscriptionToken: v,
                                          },
                                        }
                                      : d,
                                  );
                                }}
                                placeholder={editing.id ? t.passwordKeep : apiKeyPortal.placeholder}
                              />
                            </label>
                          </div>
                          <div>
                            <label className={lbl}>
                              {t.agentModelLabel}
                              <input
                                className={inp}
                                value={editing.settings.agentModel || ""}
                                onChange={(e) => setSetting("agentModel", e.target.value)}
                                placeholder={apiKeyPortal.modelPlaceholder}
                              />
                            </label>
                          </div>
                          <div>
                            <label className={lbl}>
                              {lang === "sk"
                                ? "Vlastná API URL (voliteľné)"
                                : lang === "hu"
                                  ? "Egyéni API URL (opcionális)"
                                  : "Custom API Base URL (optional)"}
                              <input
                                className={inp}
                                value={editing.settings.agentEndpoint || ""}
                                onChange={(e) => setSetting("agentEndpoint", e.target.value)}
                                placeholder="Official HTTPS API (default)"
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="type-label text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4" /> {t.agentSectionTitle}
                            </div>
                            <p className="text-micro text-slate-600 dark:text-slate-300 mt-0.5">{t.agentSectionDesc}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {data?.environment?.mode === "local_cli" &&
                              !data.environment.clis[editing.connectorType as "claude" | "chatgpt" | "antigravity"] && (
                                <button
                                  type="button"
                                  onClick={() => void onInstallCli(editing.connectorType)}
                                  disabled={busy !== null}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-micro font-semibold disabled:opacity-40"
                                >
                                  {busy === "cli" ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Terminal className="w-3.5 h-3.5" />
                                  )}
                                  {t.agentInstallCli}
                                </button>
                              )}
                            <button
                              type="button"
                              data-testid="agent-start-oauth-btn"
                              onClick={() => void onStartSubscriptionOAuth()}
                              disabled={busy !== null}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-caption font-semibold shadow-xs disabled:opacity-40 ${activeMeta.accentBtn}`}
                            >
                              {busy === "login" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <KeyRound className="w-3.5 h-3.5" />
                              )}
                              {t.agentStartLogin}
                            </button>
                          </div>
                        </div>

                        {/* Interactive PKCE / PTY OAuth Step */}
                        {oauthUrl && (
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <a
                                href={oauthUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-caption font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                {t.agentOpenAuthUrl} <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                className={`${inp} flex-1 mt-0`}
                                value={oauthCode}
                                onChange={(e) => setOauthCode(e.target.value)}
                                placeholder={t.agentCodePlaceholder}
                              />
                              <button
                                type="button"
                                onClick={() => void onSubmitSubscriptionCode()}
                                disabled={busy !== null || !oauthCode.trim()}
                                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold disabled:opacity-40"
                              >
                                {t.agentVerifyCode}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className={lbl}>
                              {t.agentTokenLabel}
                              <input
                                className={inp}
                                type="password"
                                value={editing.settings.subscriptionToken || ""}
                                onChange={(e) => setSetting("subscriptionToken", e.target.value)}
                                placeholder={
                                  editing.id
                                    ? t.passwordKeep
                                    : editing.connectorType === "claude"
                                      ? "sk-ant-oat01-…"
                                      : "OAuth session token"
                                }
                              />
                            </label>
                          </div>
                          <div>
                            <label className={lbl}>
                              {t.agentModelLabel}
                              <input
                                className={inp}
                                value={editing.settings.agentModel || ""}
                                onChange={(e) => setSetting("agentModel", e.target.value)}
                                placeholder={
                                  editing.connectorType === "claude"
                                    ? "claude-sonnet-4-5"
                                    : editing.connectorType === "antigravity"
                                      ? "gemini-3.5-flash-lite"
                                      : "gpt-5"
                                }
                              />
                            </label>
                          </div>
                          <div>
                            <label className={lbl}>
                              {t.agentEndpointLabel}
                              <input
                                className={inp}
                                value={editing.settings.agentEndpoint || ""}
                                onChange={(e) => setSetting("agentEndpoint", e.target.value)}
                                placeholder="Local embedded Marveen (default)"
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    {/* CCRM MCP Endpoint Info */}
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-micro text-slate-600 dark:text-slate-300">
                      <span>
                        CCRM MCP Endpoint:{" "}
                        <code className="font-mono text-slate-800 dark:text-slate-100">
                          {typeof window !== "undefined" ? `${window.location.origin}/api/mcp.php` : "/api/mcp.php"}
                        </code>{" "}
                        (auto-provisioned per assigned user)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/api/mcp.php`;
                          void navigator.clipboard?.writeText(url);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 1800);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700"
                      >
                        {copiedKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        Copy MCP URL
                      </button>
                    </div>

                    {agentTestOutput && (
                      <div className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-micro">
                        {agentTestOutput}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Active & Self-Signed Toggles */}
              <div className="flex flex-wrap items-center gap-4">
                {isEmailConnector(editing.connectorType) &&
                  !isMicrosoftDraft(editing) &&
                  (editing.settings.exchangeMode ?? "imap") !== "graph" && (
                    <label className="inline-flex items-center gap-2 text-caption text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.settings.imapAllowSelfSigned}
                        onChange={(e) => setSetting("imapAllowSelfSigned", e.target.checked)}
                      />
                      {t.selfSigned}
                    </label>
                  )}
                <label className="inline-flex items-center gap-2 text-caption text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isActive}
                    onChange={(e) => setField("isActive", e.target.checked)}
                  />
                  {t.active}
                </label>
              </div>

              {formMsg && (
                <div
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-caption font-medium ${
                    formMsg.kind === "ok"
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formMsg.kind === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {formMsg.text}
                </div>
              )}
            </div>

            {/* Sticky Color-Coded Modal Footer */}
            <div className="shrink-0 px-6 py-4 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onTest}
                // A Microsoft 365 mailbox can only be tested once it is saved and signed in.
                disabled={busy !== null || (isMicrosoftDraft(editing) && !editing.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-caption font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {busy === "test" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy === "test" ? t.testing : t.test}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setWaQrModalOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl text-caption font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-caption font-bold shadow-sm transition-all disabled:opacity-40 ${activeMeta.accentBtn}`}
                >
                  {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy === "save" ? t.saving : t.save}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
