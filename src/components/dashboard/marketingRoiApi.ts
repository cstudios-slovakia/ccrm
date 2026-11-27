/**
 * Browser client for `public/api/marketing_roi.php` plus the social-post read the ROI tab needs.
 * Everything here fails soft: a missing permission or an unconnected Zernio account leaves that
 * part of the tab empty instead of breaking the dashboard.
 */
import { useCallback, useEffect, useState } from "react";
import {
  defaultMarketingRoiConfig,
  normalizeMarketingRoiConfig,
  type MarketingRoiConfig,
  type NewsletterSend,
} from "../../utils/marketingRoi";

const ENDPOINT = "/api/marketing_roi.php";

const post = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data || data.success !== true) {
    throw new Error(String(data?.code || `HTTP ${res.status}`));
  }
  return data;
};

// The server sends UTC moments; periods and invoice dates are local days. A send at 00:30 on
// 1 December (23:30 UTC on 30 November) belongs to December.
const localDay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** null = the server withheld the recipients (no access to the newsletter module). */
const toSends = (raw: unknown): NewsletterSend[] | null =>
  !Array.isArray(raw)
    ? null
    : raw.flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const o = c as Record<string, unknown>;
        if (typeof o.id !== "string" || typeof o.sentAt !== "string") return [];
        const recipients = Array.isArray(o.recipients)
          ? o.recipients.flatMap((r) =>
              Array.isArray(r) && typeof r[2] === "string"
                ? [{ leadId: typeof r[0] === "string" ? r[0] : null, email: String(r[1] ?? ""), sentAt: localDay(r[2]) }]
                : [],
            )
          : [];
        return [{ id: o.id, name: String(o.name ?? ""), sentAt: localDay(o.sentAt), recipients }];
      });

export const marketingRoiApi = {
  get: async (): Promise<{ config: MarketingRoiConfig; newsletter: NewsletterSend[] | null }> => {
    const data = await post({ action: "get" });
    return { config: normalizeMarketingRoiConfig(data.config), newsletter: toSends(data.newsletter) };
  },
  save: async (config: MarketingRoiConfig): Promise<MarketingRoiConfig> => {
    const data = await post({ action: "save", config });
    return normalizeMarketingRoiConfig(data.config);
  },
};

export interface SocialPostStat {
  platform: string;
  publishedAt: string;
  impressions: number;
  clicks: number;
}

/** Published posts with their reach, from the same Zernio feed the Social media module reads. */
const fetchSocialPosts = async (): Promise<SocialPostStat[] | null> => {
  const res = await fetch("/api/zernio.php?action=get_posts", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { success?: boolean; posts?: unknown[] } | null;
  if (!data?.success || !Array.isArray(data.posts)) return null;
  return data.posts.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    // Same fallbacks as SocialMediaView's mapping, reduced to what the ROI needs.
    const o = p as Record<string, any>;
    const plat = (Array.isArray(o.platforms) && o.platforms[0]) || {};
    const status = String(o.status || "published");
    if (status !== "published") return [];
    return [{
      platform: String(plat.platform || o.platform || ""),
      publishedAt: String(plat.publishedAt || o.publishedAt || o.createdAt || ""),
      impressions: Number(o.analytics?.impressions ?? o.stats?.views ?? o.viewCount ?? 0) || 0,
      clicks: Number(o.analytics?.clicks ?? 0) || 0,
    }];
  });
};

export interface MarketingRoiData {
  loading: boolean;
  /** The server could not be read (permission, network); the config then stays at its defaults. */
  error: string | null;
  config: MarketingRoiConfig;
  /** null = no access to the newsletter module, so no recipients to credit invoices to. */
  newsletter: NewsletterSend[] | null;
  /** null = no Zernio connection or no access to Social media. */
  socialPosts: SocialPostStat[] | null;
  reload: () => void;
}

export const useMarketingRoiData = (enabled: boolean, withSocial = true): MarketingRoiData => {
  const [state, setState] = useState<Omit<MarketingRoiData, "reload">>({
    loading: true, error: null, config: defaultMarketingRoiConfig(), newsletter: [], socialPosts: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.allSettled([marketingRoiApi.get(), withSocial ? fetchSocialPosts() : Promise.resolve(null)]).then(([roi, social]) => {
      if (cancelled) return;
      setState({
        loading: false,
        error: roi.status === "rejected" ? String((roi.reason as Error)?.message || roi.reason) : null,
        config: roi.status === "fulfilled" ? roi.value.config : defaultMarketingRoiConfig(),
        newsletter: roi.status === "fulfilled" ? roi.value.newsletter : [],
        socialPosts: social.status === "fulfilled" ? social.value : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, withSocial, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, reload };
};
