import { useMemo } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  MessageCircle,
  RotateCw,
  Settings as SettingsIcon,
  ShieldOff,
  UserX,
  Wrench,
} from "lucide-react";
import { Page, PageHeader, Tabs, type TabItem } from "../layout";
import type { MetaResponse } from "./api/contract.ts";
import type { ModuleConfig } from "./api/crmConnection.ts";
import { REQUIRED_WAAI_API } from "./api/waaiClient.ts";
import { useUnread } from "./hooks/useUnread.ts";
import { useWaaiSession } from "./hooks/useWaaiSession.ts";
import { waMessages, type WaMessages } from "./i18n.ts";
import { ChatsTab } from "./chats/ChatsTab";
import { HomeBody } from "./home/HomeBody";
import { routeForTab, tabFromRoute, WA_TABS, type WaTab } from "./lib/routes.ts";
import { primaryButton, secondaryButton, StateCard } from "./StateCard";

/**
 * The native WhatsApp module (docs/WAAI-NATIVE-MODULE.md): ordinary CRM code on WAAI's module API. This is
 * the shell - the states, the header and the five tabs; each tab fills in with its phase.
 */

interface Props {
  /** The route is `whatsapp…`; false while another module is showing (the module stays alive, hidden). */
  active: boolean;
  route: string;
  language: string;
  config: ModuleConfig;
  onUnread: (chats: number) => void;
  onOpenRecord: (kind: "lead" | "project" | "task", id: string) => void;
}

/** One pill for the state of the user's WhatsApp accounts. */
function accountPill(accounts: MetaResponse["wa_accounts"], t: WaMessages): { label: string; tone: string } {
  if (accounts.length === 0) return { label: t.account.none, tone: "bg-amber-50 text-amber-700 border-amber-200" };
  if (accounts.length > 1) {
    const allUp = accounts.every((a) => a.status === "connected");
    return { label: t.account.several(accounts.length), tone: allUp ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200" };
  }
  switch (accounts[0]!.status) {
    case "connected":
      return { label: t.account.connected, tone: "bg-green-50 text-green-700 border-green-200" };
    case "pending_qr":
      return { label: t.account.waitingForQr, tone: "bg-amber-50 text-amber-700 border-amber-200" };
    case "authenticated":
      return { label: t.account.connecting, tone: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { label: t.account.disconnected, tone: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

export const NativeModule = ({ active, route, language, config, onUnread, onOpenRecord }: Props) => {
  const t = useMemo(() => waMessages(language), [language]);
  const { state, retry } = useWaaiSession(config.configured ? config.base : null);
  const client = state.kind === "ready" ? state.client : null;
  useUnread(client, onUnread);

  const openStandalone = config.standaloneUrl ? (
    <a className={secondaryButton} href={config.standaloneUrl} target="_blank" rel="noopener noreferrer">
      <ExternalLink className="size-4" />
      {t.openStandalone}
    </a>
  ) : null;
  const settingsLink = (
    <a className={primaryButton} href="#settings/integrations/waai">
      <SettingsIcon className="size-4" />
      {t.notConfigured.openSettings}
    </a>
  );

  let body: React.ReactNode;
  if (!config.configured || state.kind === "crm_not_configured") {
    body = (
      <StateCard
        testId="wa-not-configured"
        icon={<MessageCircle />}
        title={t.notConfigured.title}
        body={config.canManage ? t.notConfigured.admin : t.notConfigured.member}
        actions={config.canManage ? settingsLink : undefined}
      />
    );
  } else if (state.kind === "connecting") {
    body = (
      <div className="flex flex-1 items-center justify-center py-24" role="status" data-testid="wa-connecting">
        <Loader2 className="size-8 animate-spin text-green-600" aria-hidden />
        <span className="sr-only">{t.connecting}</span>
      </div>
    );
  } else if (state.kind === "not_linked") {
    body = <StateCard testId="wa-not-linked" tone="amber" icon={<UserX />} title={t.notLinked.title} body={t.notLinked.body} actions={openStandalone} />;
  } else if (state.kind === "needs_update") {
    body = (
      <StateCard
        testId="wa-needs-update"
        tone="amber"
        icon={<Wrench />}
        title={t.needsUpdate.title}
        body={config.canManage ? t.needsUpdate.admin(REQUIRED_WAAI_API, state.waaiVersion) : t.needsUpdate.member}
      />
    );
  } else if (state.kind === "waai_not_ready") {
    body = (
      <StateCard
        testId="wa-waai-not-ready"
        tone="amber"
        icon={<Wrench />}
        title={t.wasNotReady.title}
        body={config.canManage ? t.wasNotReady.admin : t.wasNotReady.member}
        actions={config.canManage ? settingsLink : undefined}
      />
    );
  } else if (state.kind === "forbidden") {
    body = <StateCard testId="wa-forbidden" tone="rose" icon={<ShieldOff />} title={t.forbidden.title} body={t.forbidden.body} />;
  } else if (state.kind === "unreachable") {
    body = (
      <StateCard
        testId="wa-unreachable"
        tone="rose"
        icon={<AlertTriangle />}
        title={t.unreachable.title}
        body={state.code === "rate_limited" ? t.unreachable.tooMany : t.unreachable.body}
        actions={
          <>
            <button type="button" className={primaryButton} onClick={retry}>
              <RotateCw className="size-4" />
              {t.tryAgain}
            </button>
            {openStandalone}
          </>
        }
      />
    );
  } else {
    const pill = accountPill(state.meta.wa_accounts, t);
    const tab = tabFromRoute(route);
    const items: TabItem<WaTab>[] = WA_TABS.map((key) => ({ key, label: t.tabs[key] }));
    body = (
      <Page>
        <PageHeader
          icon={<MessageCircle className="text-green-600" />}
          title={t.title}
          subtitle={t.subtitle}
          badge={
            <span
              data-testid="wa-account-pill"
              className={`type-meta mt-2 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-semibold ${pill.tone}`}
            >
              {pill.label}
            </span>
          }
          actions={openStandalone}
        />
        <Tabs
          testId="wa-tabs"
          items={items}
          value={tab}
          onChange={(next) => {
            window.location.hash = `#${routeForTab(next)}`;
          }}
        />
        {tab === "chats" ? (
          <ChatsTab
            client={state.client}
            route={route}
            params={new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?") + 1) : "")}
            language={language}
            active={active}
            onOpenRecord={onOpenRecord}
          />
        ) : (
          <HomeBody
            tab={tab}
            route={route}
            client={state.client}
            language={language}
            admin={state.meta.user.role === "admin"}
            onOpenRecord={onOpenRecord}
          />
        )}
      </Page>
    );
  }

  return (
    <div className={active ? "flex flex-1 flex-col" : "hidden"} data-testid="wa-native">
      {body}
    </div>
  );
};
