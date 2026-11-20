import React, { useMemo } from "react";
import { BarChart3, Compass, Globe, Mail, Megaphone, Settings2, Share2 } from "lucide-react";
import type { InvoiceOffer, Lead } from "../../types";
import type { OfferStatusDef } from "../../utils/offerStatuses";
import {
  attributeNewsletter,
  categoryCost,
  financeForPeriod,
  inPeriod,
  leadsByChannel,
  roiPct,
  type FinanceInput,
  type Period,
} from "../../utils/marketingRoi";
import { useMarketingRoiData } from "./marketingRoiApi";

/** A paid campaign from Settings → Integrations → Ads (Meta / Google). */
export interface AdCampaign {
  id: string;
  name: string;
  platform: "meta" | "google";
  status: string;
  impressions: number;
  clicks: number;
  spent: number;
  leads: number;
}

type T = (en: string, sk: string, hu: string) => string;
type Money = (value: number, opts?: Intl.NumberFormatOptions) => string;

interface Props {
  t: T;
  money: Money;
  period: Period;
  /** Every lead and client (for the lead → client link of newsletter recipients). */
  allLeads: Lead[];
  /** Pipeline leads created in the period. */
  pipelineLeads: Lead[];
  isWon: (status: string) => boolean;
  finance: FinanceInput;
  invoices: InvoiceOffer[];
  invoiceStatuses?: OfferStatusDef[];
  adCampaigns: AdCampaign[];
}

const SETTINGS_HREF = "#settings/integrations/marketing_roi";

const roiText = (roi: number | null) => (roi === null ? "—" : `${roi.toFixed(0)} %`);

const RoiBadge: React.FC<{ roi: number | null; t: T }> = ({ roi, t }) => (
  <span
    className={`text-ui font-bold px-3 py-1 rounded-full border ${
      roi === null ? "text-slate-500 bg-slate-50 border-slate-200" : roi >= 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"
    }`}
    title={roi === null ? t("No cost recorded for this period", "Za toto obdobie nie sú zapísané žiadne náklady", "Ebben az időszakban nincs rögzített költség") : undefined}
  >
    ROI: {roiText(roi)}
  </span>
);

const Figure: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = "text-slate-800" }) => (
  <div className="p-3 bg-white rounded-2xl border border-slate-100 min-w-0">
    <span className="type-overline text-slate-400 block">{label}</span>
    <span className={`text-title-sm font-bold block mt-1 truncate ${tone}`}>{value}</span>
  </div>
);

const ChannelCard: React.FC<{ icon: React.ReactNode; title: string; caption: string; roi: number | null; t: T; children: React.ReactNode }> = ({
  icon, title, caption, roi, t, children,
}) => (
  <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
    <div className="flex justify-between items-center gap-3 border-b border-slate-200 pb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div className="flex flex-col min-w-0">
          <h3 className="text-ui font-heading font-bold text-slate-800">{title}</h3>
          <span className="type-overline text-slate-400 truncate">{caption}</span>
        </div>
      </div>
      <RoiBadge roi={roi} t={t} />
    </div>
    {children}
  </div>
);

type FigureInput = Omit<Props, "t" | "money">;

/** Every number the ROI tab and the overview summary show, computed once from the same rules. */
export const useMarketingRoiFigures = (
  { period, allLeads, pipelineLeads, isWon, finance, invoices, invoiceStatuses, adCampaigns }: FigureInput,
  withSocial: boolean,
) => {
  const data = useMarketingRoiData(true, withSocial);
  const { config } = data;

  const agg = useMemo(() => financeForPeriod(finance, period), [finance, period]);
  const newsletterCost = categoryCost(agg, finance.categories, config.newsletterCostCategoryIds);
  const socialCost = categoryCost(agg, finance.categories, config.socialCostCategoryIds);

  const newsletterAvailable = data.newsletter !== null;
  const newsletter = useMemo(
    () => attributeNewsletter(data.newsletter || [], invoices, allLeads, invoiceStatuses, config.newsletterWindowDays, period),
    [data.newsletter, invoices, allLeads, invoiceStatuses, config.newsletterWindowDays, period],
  );
  const channels = useMemo(() => leadsByChannel(pipelineLeads, config, isWon), [pipelineLeads, config, isWon]);

  const posts = useMemo(() => (data.socialPosts || []).filter((p) => inPeriod(p.publishedAt, period)), [data.socialPosts, period]);
  const impressions = posts.reduce((s, p) => s + p.impressions, 0);
  const clicks = posts.reduce((s, p) => s + p.clicks, 0);

  const metaSpent = adCampaigns.filter((c) => c.platform === "meta").reduce((s, c) => s + (Number(c.spent) || 0), 0);
  const googleSpent = adCampaigns.filter((c) => c.platform === "google").reduce((s, c) => s + (Number(c.spent) || 0), 0);
  const adsSpent = metaSpent + googleSpent;
  const adsRevenue = channels.meta_ads.wonValue + channels.google_ads.wonValue;

  // Ad campaigns carry one lifetime spend and no dates, so with a date filter they cannot be set
  // against the period's revenue: they stay out of the totals and the card says "all time".
  const adsInTotals = !period.startIso && !period.endIso;
  const totalCost = newsletterCost + socialCost + (adsInTotals ? adsSpent : 0);
  const totalRevenue = newsletter.revenue + channels.social.wonValue + (adsInTotals ? adsRevenue : 0);
  const notConfigured =
    config.newsletterCostCategoryIds.length === 0 && config.socialCostCategoryIds.length === 0 && Object.keys(config.sourceChannels).length === 0;

  return {
    data, config, newsletter, newsletterAvailable, channels, posts, impressions, clicks, notConfigured,
    newsletterCost, socialCost, metaSpent, googleSpent, adsSpent, adsRevenue, adsInTotals, totalCost, totalRevenue,
  };
};

const SetupHint: React.FC<{ t: T; error: boolean }> = ({ t, error }) => (
  <a
    href={SETTINGS_HREF}
    className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
  >
    <Settings2 className="h-5 w-5 shrink-0 mt-0.5" />
    <span className="text-ui">
      {error
        ? t("The marketing settings could not be loaded. ROI is shown with defaults.", "Nastavenia marketingu sa nepodarilo načítať. ROI sa zobrazuje s predvolenými hodnotami.", "A marketingbeállításokat nem sikerült betölteni. A ROI alapértékekkel látható.")
        : t(
            "Choose which expense categories hold the newsletter and social media costs, and which lead sources belong to which channel: Settings → Integrations → Marketing ROI.",
            "Vyberte, v ktorých kategóriách výdavkov sú náklady na newsletter a sociálne siete a ktoré zdroje leadov patria ku ktorému kanálu: Nastavenia → Integrácie → Marketingové ROI.",
            "Válassza ki, mely költségkategóriákban vannak a hírlevél és a közösségi média költségei, és mely lead-források melyik csatornához tartoznak: Beállítások → Integrációk → Marketing ROI.",
          )}
    </span>
  </a>
);

/** The overview tab's "ROI by channel" panel: the same figures as the Marketing ROI tab, condensed. */
export const MarketingRoiSummary: React.FC<Props & { onOpen: () => void }> = ({ t, money, onOpen, ...input }) => {
  const f = useMarketingRoiFigures(input, false);
  const rows = [
    { key: "nl", name: t("Newsletter", "Newsletter", "Hírlevél"), cost: f.newsletterCost, revenue: f.newsletter.revenue, roi: roiPct(f.newsletter.revenue, f.newsletterCost), badge: "bg-sky-50 text-sky-700 border-sky-200" },
    { key: "soc", name: t("Social media", "Sociálne siete", "Közösségi média"), cost: f.socialCost, revenue: f.channels.social.wonValue, roi: roiPct(f.channels.social.wonValue, f.socialCost), badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
    { key: "ads", name: t("Paid ads (Meta, Google)", "Platená reklama (Meta, Google)", "Fizetett hirdetések (Meta, Google)"), cost: f.adsSpent, revenue: f.adsRevenue, roi: f.adsInTotals ? roiPct(f.adsRevenue, f.adsSpent) : null, badge: "bg-amber-50 text-amber-700 border-amber-200" },
  ];
  return (
    <div className="space-y-4 pt-2">
      {!f.data.loading && (f.notConfigured || f.data.error) && <SetupHint t={t} error={!!f.data.error} />}
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={onOpen}
          className="w-full text-left p-3.5 rounded-2xl border border-slate-100 space-y-2 hover:border-slate-200 hover:shadow-sm transition-all cursor-pointer"
        >
          <div className="flex justify-between items-center">
            <span className="text-ui font-bold text-slate-800">{row.name}</span>
            <span className={`px-2.5 py-0.5 rounded-full type-overline border ${row.badge}`}>ROI: {roiText(row.roi)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-caption font-semibold text-slate-500">
            <div>{t("Cost", "Náklady", "Költség")}: <strong className="text-slate-800">{money(row.cost)}</strong></div>
            <div>{t("Revenue", "Tržby", "Bevétel")}: <strong className="text-slate-800">{money(row.revenue)}</strong></div>
          </div>
        </button>
      ))}
    </div>
  );
};

export const MarketingRoiTab: React.FC<Props> = ({ t, money, ...input }) => {
  const {
    data, config, newsletter, newsletterAvailable, channels, posts, impressions, clicks, notConfigured,
    newsletterCost, socialCost, metaSpent, googleSpent, adsSpent, adsRevenue, adsInTotals, totalCost, totalRevenue,
  } = useMarketingRoiFigures(input, true);
  const { adCampaigns } = input;

  const perLead = (cost: number, count: number) => (count > 0 && cost > 0 ? money(cost / count, { maximumFractionDigits: 1 }) : "—");
  const dateLabel = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {!data.loading && (notConfigured || data.error) && <SetupHint t={t} error={!!data.error} />}

      {/* Totals */}
      <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
        <h3 className="text-ui font-heading font-bold text-slate-900 flex items-center gap-1.5">
          <Compass className="h-4 w-4 text-indigo-600" /> {t("Marketing across all channels", "Marketing naprieč kanálmi", "Marketing az összes csatornán")}
        </h3>
        <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="type-overline text-slate-400 block">{t("Marketing costs", "Náklady na marketing", "Marketingköltségek")}</span>
            <span className="text-title font-bold text-slate-800 block mt-1">{money(totalCost)}</span>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="type-overline text-slate-400 block">{t("Revenue credited to marketing", "Tržby pripísané marketingu", "Marketingnek tulajdonított bevétel")}</span>
            <span className="text-title font-bold text-slate-800 block mt-1">{money(totalRevenue)}</span>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="type-overline text-slate-400 block">{t("Total ROI", "Celkové ROI", "Teljes ROI")}</span>
            {(() => {
              const roi = roiPct(totalRevenue, totalCost);
              return (
                <span className={`text-title font-bold block mt-1 ${roi === null ? "text-slate-400" : roi >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {roiText(roi)}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 ws-lg:grid-cols-3 gap-6">
        <ChannelCard
          t={t}
          icon={<Mail className="h-5 w-5 text-sky-600" />}
          title={t("Newsletter", "Newsletter", "Hírlevél")}
          caption={!newsletterAvailable ? t("You have no access to the newsletter", "Nemáte prístup k newsletteru", "Nincs hozzáférése a hírlevélhez") : t(
            `Invoices within ${config.newsletterWindowDays} days after a send`,
            `Faktúry do ${config.newsletterWindowDays} dní po odoslaní`,
            `Számlák a kiküldést követő ${config.newsletterWindowDays} napon belül`,
          )}
          roi={roiPct(newsletter.revenue, newsletterCost)}
        >
          <div className="grid grid-cols-2 gap-2 text-center">
            <Figure label={t("Cost", "Náklady", "Költség")} value={money(newsletterCost)} />
            <Figure label={t("Credited revenue", "Pripísané tržby", "Tulajdonított bevétel")} value={money(newsletter.revenue)} tone="text-emerald-600" />
            <Figure label={t("Campaigns · recipients", "Kampane · príjemcovia", "Kampányok · címzettek")} value={`${newsletter.campaigns.length} · ${newsletter.recipients}`} />
            <Figure label={t("Invoices credited", "Pripísané faktúry", "Tulajdonított számlák")} value={newsletter.invoices} />
          </div>
        </ChannelCard>

        <ChannelCard
          t={t}
          icon={<Share2 className="h-5 w-5 text-fuchsia-600" />}
          title={t("Social media", "Sociálne siete", "Közösségi média")}
          caption={t("Won leads from social sources", "Vyhraté leady zo sociálnych zdrojov", "Megnyert leadek közösségi forrásokból")}
          roi={roiPct(channels.social.wonValue, socialCost)}
        >
          <div className="grid grid-cols-2 gap-2 text-center">
            <Figure label={t("Cost", "Náklady", "Költség")} value={money(socialCost)} />
            <Figure label={t("Won value", "Hodnota vyhratých", "Megnyert érték")} value={money(channels.social.wonValue)} tone="text-emerald-600" />
            <Figure label={t("Leads · won", "Leady · vyhraté", "Leadek · megnyert")} value={`${channels.social.leads} · ${channels.social.won}`} />
            <Figure label={t("Cost per lead", "Cena za lead", "Költség leadenként")} value={perLead(socialCost, channels.social.leads)} />
            {data.socialPosts !== null && (
              <>
                <Figure label={t("Posts · impressions", "Príspevky · zobrazenia", "Bejegyzések · megjelenések")} value={`${posts.length} · ${impressions.toLocaleString()}`} />
                <Figure label={t("Clicks · cost per click", "Kliky · cena za klik", "Kattintások · kattintásonkénti költség")} value={`${clicks.toLocaleString()} · ${perLead(socialCost, clicks)}`} />
              </>
            )}
          </div>
        </ChannelCard>

        <ChannelCard
          t={t}
          icon={<Megaphone className="h-5 w-5 text-amber-600" />}
          title={t("Paid ads", "Platená reklama", "Fizetett hirdetések")}
          caption={adsInTotals
            ? t("Meta & Google campaign spend", "Výdavky na kampane Meta a Google", "Meta és Google kampányköltés")
            : t("Spend is all-time; clear the date filter for ROI", "Výdavky sú za celé obdobie; ROI uvidíte bez filtra dátumu", "A költés a teljes időszakra szól; a ROI dátumszűrő nélkül látható")}
          roi={adsInTotals ? roiPct(adsRevenue, adsSpent) : null}
        >
          <div className="space-y-2">
            {([
              ["Meta", metaSpent, channels.meta_ads],
              ["Google", googleSpent, channels.google_ads],
            ] as const).map(([name, spent, ch]) => (
              <div key={name} className="grid grid-cols-4 gap-2 items-center p-3 bg-white rounded-2xl border border-slate-100 text-micro font-semibold text-slate-500">
                <span className="text-ui font-bold text-slate-800 flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{name}</span>
                <div>{t("Spent", "Minuté", "Elköltött")}<strong className="text-slate-800 block">{money(spent)}</strong></div>
                <div>{t("Leads · won", "Leady · vyhraté", "Leadek · megnyert")}<strong className="text-slate-800 block">{ch.leads} · {ch.won}</strong></div>
                <div>ROI<strong className="text-slate-800 block">{roiText(adsInTotals ? roiPct(ch.wonValue, spent) : null)}</strong></div>
              </div>
            ))}
          </div>
        </ChannelCard>
      </div>

      {newsletter.campaigns.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
          <h3 className="text-ui font-heading font-bold text-slate-900 flex items-center gap-1.5">
            <Mail className="h-4 w-4 text-sky-600" /> {t("Newsletter campaigns", "Newsletterové kampane", "Hírlevélkampányok")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-ui">
              <thead>
                <tr className="text-left type-overline text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">{t("Campaign", "Kampaň", "Kampány")}</th>
                  <th className="py-2 px-3">{t("Sent", "Odoslaná", "Kiküldve")}</th>
                  <th className="py-2 px-3 text-right">{t("Recipients", "Príjemcovia", "Címzettek")}</th>
                  <th className="py-2 px-3 text-right">{t("Invoices", "Faktúry", "Számlák")}</th>
                  <th className="py-2 pl-3 text-right">{t("Credited revenue", "Pripísané tržby", "Tulajdonított bevétel")}</th>
                </tr>
              </thead>
              <tbody>
                {[...newsletter.campaigns].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3 font-bold text-slate-800">{c.name}</td>
                    <td className="py-2 px-3 text-slate-500">{dateLabel(c.sentAt)}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.recipients}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.invoices}</td>
                    <td className="py-2 pl-3 text-right font-bold text-emerald-600">{money(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adCampaigns.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
          <h3 className="text-ui font-heading font-bold text-slate-900 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-indigo-600" /> {t("Paid campaign breakdown", "Rozpis platených kampaní", "Fizetett kampányok bontása")}
          </h3>
          <div className="grid grid-cols-1 ws-lg:grid-cols-2 gap-3">
            {adCampaigns.map((c) => {
              const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00";
              return (
                <div key={c.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex justify-between items-start gap-3">
                    <span className="text-ui font-bold text-slate-800 leading-tight">{c.name}</span>
                    <span className="px-2 py-0.5 rounded type-overline border shrink-0 bg-slate-100 text-slate-500 border-slate-200">
                      {c.platform === "meta" ? "Meta" : "Google"} · {c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-micro font-semibold text-slate-500 pt-2 border-t border-slate-100">
                    <div>{t("Spent", "Minuté", "Elköltött")}<strong className="text-slate-800 block mt-0.5">{money(c.spent)}</strong></div>
                    <div>{t("Clicks", "Kliknutia", "Kattintások")}<strong className="text-slate-800 block mt-0.5">{c.clicks}</strong></div>
                    <div>CTR<strong className="text-indigo-600 block mt-0.5">{ctr} %</strong></div>
                    <div>{t("Leads", "Leady", "Leadek")}<strong className="text-emerald-600 block mt-0.5">{c.leads}</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
