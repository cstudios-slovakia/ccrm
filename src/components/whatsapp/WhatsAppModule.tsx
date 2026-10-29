import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { WhatsAppView } from "../WhatsAppView";
import { fetchModuleConfig, type ModuleConfig } from "./api/crmConnection.ts";
import { waMessages } from "./i18n.ts";
import { NativeModule } from "./NativeModule";
import { primaryButton, StateCard } from "./StateCard";

/**
 * The WhatsApp module's entry: asks the CRM how the connection is set up (Settings → Integrations →
 * WhatsApp) and shows the native interface or, until it is retired, the embedded WAAI frame. Takes the
 * props of `WhatsAppView`, so `App` hosts either without knowing which.
 */

interface Props {
  /** The route is `whatsapp…`; false while another module is showing (the module stays alive, hidden). */
  active: boolean;
  route: string;
  params: URLSearchParams;
  language: "en" | "sk" | "hu";
  currentUserId: string;
  onUnread: (chats: number) => void;
  /** WAAI asked for a CRM record (the embedded interface's `waai:open-crm`). */
  onOpenRecord: (kind: "lead" | "project" | "task", id: string) => void;
}

export const WhatsAppModule = (props: Props) => {
  const { active, route, language, onUnread } = props;
  const t = waMessages(language);
  const [config, setConfig] = useState<ModuleConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchModuleConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The embedded interface does its own thing, as it did before.
  if (config?.ui === "embedded") return <WhatsAppView {...props} />;
  if (config) return <NativeModule active={active} route={route} language={language} config={config} onUnread={onUnread} />;

  return (
    <div className={active ? "flex flex-1 flex-col" : "hidden"}>
      {failed ? (
        <StateCard
          testId="wa-config-failed"
          tone="rose"
          icon={<AlertTriangle />}
          title={t.unreachable.title}
          body={t.unreachable.body}
          actions={
            <button type="button" className={primaryButton} onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw className="size-4" />
              {t.tryAgain}
            </button>
          }
        />
      ) : (
        <div className="flex flex-1 items-center justify-center py-24" role="status">
          <Loader2 className="size-8 animate-spin text-green-600" aria-hidden />
          <span className="sr-only">{t.connecting}</span>
        </div>
      )}
    </div>
  );
};

export default WhatsAppModule;
