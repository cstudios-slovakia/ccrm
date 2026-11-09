import { useMemo, useState } from "react";
import { ArrowLeft, Mail, Plus } from "lucide-react";
import { Page, PageHeader, Tabs } from "../layout";
import type { ClientCategory, Lead } from "../../types";
import { makeT } from "../../utils/timeTracking";
import { CampaignList } from "./CampaignList";
import { CampaignScreen } from "./CampaignScreen";
import { UnsubscribedTab } from "./UnsubscribedTab";
import { newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import { BTN_PRIMARY, BTN_SECONDARY, type NewsletterData, type NewsletterEnv } from "./shared";

type Tab = "campaigns" | "unsubscribed";

export interface NewsletterViewProps {
  language: string;
  /** The active route, e.g. `newsletter`, `newsletter/<id>` or `newsletter/<id>/design`. */
  route: string;
  onNavigate: (route: string) => void;
  canEdit: boolean;
  canSend: boolean;
  leads: Lead[];
  clientCategories: ClientCategory[];
  leadStates: string[];
  leadCategories: string[];
  userEmail: string;
}

/** The Newsletter module (docs/NEWSLETTER.md C12): campaign list, draft screen, design route. */
export const NewsletterView = (props: NewsletterViewProps) => {
  const { language, route, onNavigate, canEdit, canSend } = props;
  const t = useMemo(() => makeT(language), [language]);
  const env: NewsletterEnv = { language, t, canEdit, canSend, navigate: onNavigate };
  const data: NewsletterData = {
    leads: props.leads,
    clientCategories: props.clientCategories,
    leadStates: props.leadStates,
    leadCategories: props.leadCategories,
    userEmail: props.userEmail,
  };
  const [tab, setTab] = useState<Tab>("campaigns");
  const [creating, setCreating] = useState(false);

  const parts = route.split("?")[0].split("/").filter(Boolean);
  const campaignId = parts[1] ? decodeURIComponent(parts[1]) : null;

  const create = async () => {
    setCreating(true);
    try {
      const c = await newsletterApi.create();
      onNavigate(`newsletter/${c.id}`);
    } catch (e) {
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    } finally {
      setCreating(false);
    }
  };

  if (campaignId && parts[2] === "design") {
    return (
      <Page>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <button type="button" className={BTN_SECONDARY} onClick={() => onNavigate(`newsletter/${campaignId}`)}>
            <ArrowLeft className="size-4" />
            {t("Back to the campaign", "Späť na kampaň", "Vissza a kampányhoz")}
          </button>
          <p className="type-body mt-6 text-slate-500">{t("Design editor coming soon.", "Editor dizajnu už čoskoro.", "A dizájnszerkesztő hamarosan érkezik.")}</p>
        </div>
      </Page>
    );
  }

  if (campaignId) return <CampaignScreen key={campaignId} id={campaignId} env={env} data={data} />;

  return (
    <Page>
      <PageHeader
        icon={<Mail />}
        title={t("Newsletter", "Newsletter", "Hírlevél")}
        subtitle={t(
          "E-mail campaigns to your clients.",
          "E-mailové kampane pre vašich klientov.",
          "E-mail kampányok az ügyfeleinek.",
        )}
        actions={
          canEdit && (
            <button type="button" onClick={create} disabled={creating} className={BTN_PRIMARY} data-testid="newsletter-new">
              <Plus className="size-4" />
              {t("New campaign", "Nová kampaň", "Új kampány")}
            </button>
          )
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: "campaigns", label: t("Campaigns", "Kampane", "Kampányok") },
          { key: "unsubscribed", label: t("Unsubscribed", "Odhlásení", "Leiratkozottak") },
        ]}
      />
      {tab === "campaigns" ? <CampaignList env={env} onCreate={create} creating={creating} /> : <UnsubscribedTab env={env} />}
    </Page>
  );
};

export default NewsletterView;
