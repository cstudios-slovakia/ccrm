import type { DemoSocialPostSource } from "./socialPostsTypes.ts";
import { DEMO_SOCIAL_POSTS as SK } from "./sk/socialPosts.ts";
import { DEMO_SOCIAL_POSTS as HU } from "./hu/socialPosts.ts";
import { DEMO_SOCIAL_POSTS as EN } from "./en/socialPosts.ts";

export type { DemoSocialPostSource } from "./socialPostsTypes.ts";

/** The social post a view renders; structurally the `SocialPost` of SocialMediaView. */
export interface DemoSocialPost {
  id: string;
  platform: string;
  accountName: string;
  accountHandle: string;
  content: string;
  mediaType?: "image" | "video" | "carousel";
  status: "published" | "scheduled" | "draft";
  publishedAt?: string;
  scheduledFor?: string;
  platformPostUrl?: string;
  stats: DemoSocialPostSource["stats"];
}

const PACKS: Record<string, DemoSocialPostSource[]> = { sk: SK, hu: HU, en: EN };

/** The pack of a system language; anything that is not sk or hu gets the English pack. */
export function demoSocialPackFor(language: string): DemoSocialPostSource[] {
  return PACKS[language] ?? EN;
}

/** Local `now` + `day` days at `HH:MM`, as an ISO string. */
function at(now: Date, day: number, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m, 0, 0);
  return d.toISOString();
}

/**
 * The demo posts for a system language, dated relative to `now`: published posts in the past, scheduled posts
 * in the future, newest first (the order the live feed uses).
 */
export function getDemoSocialPosts(language: string, now: Date = new Date()): DemoSocialPost[] {
  const posts = demoSocialPackFor(language).map((p): DemoSocialPost => {
    const { day, time, ...rest } = p;
    const post: DemoSocialPost = { ...rest };
    if (day !== undefined && time) {
      if (p.status === "published") post.publishedAt = at(now, day, time);
      else if (p.status === "scheduled") post.scheduledFor = at(now, day, time);
    }
    return post;
  });
  return posts.sort((a, b) => new Date(b.publishedAt ?? b.scheduledFor ?? 0).getTime() - new Date(a.publishedAt ?? a.scheduledFor ?? 0).getTime());
}
