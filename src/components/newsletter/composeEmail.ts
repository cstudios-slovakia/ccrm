/**
 * Puts the e-mail together the way it is sent (docs/NEWSLETTER.md B2.2): global header + body +
 * global footer + theme through `renderEmail()`. The Content card, the design route, Send test and
 * Start send all go through here, so what is previewed is what is posted.
 */
import { defaultFooter, defaultHeader, renderEmail, type CompanyInfo, type EmailDoc, type RenderResult } from "./builder";
import type { Campaign, NewsletterConfig } from "./types";

/** The header the campaign shows: nothing when switched off, the configured one, else the default. */
export const resolveHeader = (campaign: Pick<Campaign, "useHeader">, config: NewsletterConfig, company: CompanyInfo, lang: string): EmailDoc | null =>
  campaign.useHeader ? (config.header ?? defaultHeader(company, lang)) : null;

export const resolveFooter = (campaign: Pick<Campaign, "useFooter">, config: NewsletterConfig, company: CompanyInfo, lang: string): EmailDoc | null =>
  campaign.useFooter ? (config.footer ?? defaultFooter(company, lang)) : null;

export const composeEmail = (p: {
  campaign: Pick<Campaign, "body" | "useHeader" | "useFooter" | "subject" | "preheader">;
  config: NewsletterConfig;
  company: CompanyInfo;
  language: string;
  assetBaseUrl: string;
}): RenderResult =>
  renderEmail({
    header: resolveHeader(p.campaign, p.config, p.company, p.language),
    body: p.campaign.body ?? { version: 1, rows: [] },
    footer: resolveFooter(p.campaign, p.config, p.company, p.language),
    theme: p.config.theme,
    subject: p.campaign.subject,
    preheader: p.campaign.preheader,
    assetBaseUrl: p.assetBaseUrl,
    lang: p.language,
  });
