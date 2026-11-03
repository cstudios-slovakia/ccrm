/**
 * Shape of a demo social post as a pack authors it (docs/DEMO-MODE.md, phase 4D).
 *
 * A pack is data only: the three languages (`sk/`, `hu/`, `en/`) hold the same posts in the same order with
 * the same ids, platforms, statuses, day offsets, times and numbers - only the text differs. The builder in
 * `socialPosts.ts` turns day offsets into real timestamps, so a demo opens on recent posts whenever it runs.
 */
export type DemoPostPlatform = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "threads";

export interface DemoSocialPostSource {
  id: string;
  platform: DemoPostPlatform;
  accountName: string;
  accountHandle: string;
  content: string;
  mediaType?: "image" | "video" | "carousel";
  status: "published" | "scheduled" | "draft";
  /** Days from today (negative = past). Published posts sit in the past, scheduled ones in the future, drafts have none. */
  day?: number;
  /** Local HH:MM. */
  time?: string;
  platformPostUrl?: string;
  stats: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    clicks: number;
    engagementRate: number;
  };
}
