import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  Share2, Calendar, BarChart3, List, Search, RefreshCw, 
  ExternalLink, Heart, MessageSquare, Repeat, Eye, 
  TrendingUp, Globe, CheckCircle2, ChevronLeft, ChevronRight, ArrowLeft,
  Sparkles, Zap, X, Bookmark, Send, MoreHorizontal, Download,
  Clock, Award, Activity, Filter, Check
} from "lucide-react";
import { CustomSelect } from "./ui/CustomSelect";
import type { Language } from "../utils/translations";

interface SocialMediaViewProps {
  systemLanguage: Language;
  integrationsConfig?: any;
  isDemoMode?: boolean;
}

export interface SocialPost {
  id: string;
  platform: string;
  // The Zernio SocialAccount the post was published through. The inbox endpoints
  // (comments, replies) are scoped per connected account and reject a call
  // without it, so it has to survive the mapping.
  accountId?: string;
  accountName: string;
  accountHandle: string;
  accountAvatar?: string;
  content: string;
  mediaUrls?: string[];
  mediaType?: "image" | "video" | "carousel";
  status: "published" | "scheduled" | "draft";
  publishedAt?: string;
  scheduledFor?: string;
  platformPostUrl?: string;
  stats: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    clicks: number;
    engagementRate: number; // e.g. 4.8 for 4.8%
  };
}

// Shape of GET /v1/inbox/comments/{postId}, flattened to what the stream renders.
export interface SocialComment {
  id: string;
  author: string;
  handle: string;
  text: string;
  time: string;
  likes: number;
}

const PLATFORM_CONFIG: Record<string, { name: string; color: string; bg: string; border: string; text: string; icon: string }> = {
  twitter: { name: "Twitter / X", color: "#000000", bg: "bg-slate-900", border: "border-slate-800", text: "text-white", icon: "Twitter" },
  instagram: { name: "Instagram", color: "#e1306c", bg: "bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600", border: "border-rose-300", text: "text-white", icon: "Instagram" },
  tiktok: { name: "TikTok", color: "#00f2fe", bg: "bg-slate-950", border: "border-cyan-500/30", text: "text-cyan-400", icon: "Video" },
  linkedin: { name: "LinkedIn", color: "#0a66c2", bg: "bg-blue-700", border: "border-blue-600", text: "text-white", icon: "Linkedin" },
  youtube: { name: "YouTube", color: "#ff0000", bg: "bg-red-600", border: "border-red-500", text: "text-white", icon: "Youtube" },
  facebook: { name: "Facebook", color: "#1877f2", bg: "bg-blue-600", border: "border-blue-500", text: "text-white", icon: "Facebook" },
  threads: { name: "Threads", color: "#000000", bg: "bg-slate-900", border: "border-slate-700", text: "text-white", icon: "AtSign" },
  bluesky: { name: "Bluesky", color: "#0085ff", bg: "bg-sky-500", border: "border-sky-400", text: "text-white", icon: "Cloud" },
  pinterest: { name: "Pinterest", color: "#e60023", bg: "bg-red-700", border: "border-red-600", text: "text-white", icon: "Image" },
  reddit: { name: "Reddit", color: "#ff4500", bg: "bg-orange-600", border: "border-orange-500", text: "text-white", icon: "MessageCircle" },
  googlebusiness: { name: "Google Business", color: "#4285f4", bg: "bg-blue-500", border: "border-blue-400", text: "text-white", icon: "Store" },
  telegram: { name: "Telegram", color: "#229ed9", bg: "bg-sky-600", border: "border-sky-500", text: "text-white", icon: "Send" },
  snapchat: { name: "Snapchat", color: "#fffc00", bg: "bg-yellow-400", border: "border-yellow-300", text: "text-slate-900", icon: "Ghost" },
  whatsapp: { name: "WhatsApp", color: "#25d366", bg: "bg-emerald-500", border: "border-emerald-400", text: "text-white", icon: "MessageSquare" },
  discord: { name: "Discord", color: "#5865f2", bg: "bg-indigo-500", border: "border-indigo-400", text: "text-white", icon: "Gamepad2" }
};

const SAMPLE_POSTS: SocialPost[] = [
  {
    id: "post_1",
    platform: "twitter",
    accountName: "CCRM Official",
    accountHandle: "@ccrm_app",
    content: "🚀 We just launched our brand new CCRM Social Media Engine v1.7! Manage all 15+ social networks natively right inside your CRM. #buildinpublic #crm #tech",
    status: "published",
    publishedAt: "2026-07-28T18:30:00Z",
    platformPostUrl: "https://x.com/ccrm_app/status/1001",
    stats: { likes: 142, comments: 28, shares: 19, impressions: 4250, clicks: 310, engagementRate: 4.8 }
  },
  {
    id: "post_2",
    platform: "linkedin",
    accountName: "CCRM Enterprise",
    accountHandle: "ccrm-technologies",
    content: "Automating workflow triggers across email, tasks, and social media scheduling boosts team output by 340%. Read our full engineering breakdown of the Social integration.",
    status: "published",
    publishedAt: "2026-07-28T14:15:00Z",
    platformPostUrl: "https://linkedin.com/posts/ccrm-tech-1002",
    stats: { likes: 89, comments: 14, shares: 11, impressions: 2840, clicks: 195, engagementRate: 3.9 }
  },
  {
    id: "post_3",
    platform: "instagram",
    accountName: "CCRM Design Studio",
    accountHandle: "@ccrm_studio",
    content: "Behind the scenes: Crafting ultra-fluid glassmorphic user interfaces for high-converting sales pipelines. ✨ Gradient magic in action!",
    mediaUrls: ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"],
    mediaType: "image",
    status: "published",
    publishedAt: "2026-07-28T11:00:00Z",
    platformPostUrl: "https://instagram.com/p/ccrm1003",
    stats: { likes: 312, comments: 45, shares: 38, impressions: 5890, clicks: 420, engagementRate: 6.7 }
  },
  {
    id: "post_4",
    platform: "tiktok",
    accountName: "CCRM Tech Tips",
    accountHandle: "@ccrm_tiktok",
    content: "3 CRM automation hacks that save sales reps 10 hours every week ⚡ #sales #crm #automation #ai",
    mediaUrls: ["https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop&q=60"],
    mediaType: "video",
    status: "published",
    publishedAt: "2026-07-27T19:40:00Z",
    platformPostUrl: "https://tiktok.com/@ccrm_tiktok/video/1004",
    stats: { likes: 1240, comments: 180, shares: 215, impressions: 18500, clicks: 940, engagementRate: 8.8 }
  },
  {
    id: "post_5",
    platform: "youtube",
    accountName: "CCRM Channel",
    accountHandle: "@ccrm_youtube",
    content: "Full Walkthrough: Building Custom AI Dashboards & Workflows in 10 Minutes 🎥 Watch the full tutorial now on YouTube!",
    mediaUrls: ["https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=60"],
    mediaType: "image",
    status: "published",
    publishedAt: "2026-07-27T15:00:00Z",
    platformPostUrl: "https://youtube.com/watch?v=ccrm1005",
    stats: { likes: 490, comments: 62, shares: 41, impressions: 8400, clicks: 1120, engagementRate: 5.2 }
  },
  {
    id: "post_6",
    platform: "twitter",
    accountName: "CCRM Official",
    accountHandle: "@ccrm_app",
    content: "Scheduled release: Introducing native AI Lead Enrichment & Auto-Scoring for incoming web forms! 🧠✨ Stay tuned.",
    status: "scheduled",
    scheduledFor: "2026-07-29T10:00:00Z",
    stats: { likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0, engagementRate: 0 }
  },
  {
    id: "post_7",
    platform: "facebook",
    accountName: "CCRM Official Page",
    accountHandle: "ccrm.official",
    content: "Join our upcoming live Q&A session with product lead Erik as we explore social media automation workflows!",
    status: "scheduled",
    scheduledFor: "2026-07-30T14:00:00Z",
    stats: { likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0, engagementRate: 0 }
  },
  {
    id: "post_8",
    platform: "threads",
    accountName: "CCRM Official",
    accountHandle: "@ccrm_app",
    content: "Draft idea: Quick survey asking users which AI LLM model (GPT-4o, Claude 3.5, Gemini 1.5) they prefer for proposal generation.",
    status: "draft",
    stats: { likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0, engagementRate: 0 }
  }
];

export const SocialMediaView: React.FC<SocialMediaViewProps> = ({
  systemLanguage,
  integrationsConfig,
  isDemoMode = false
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // View state
  const [activeView, setActiveView] = useState<"list" | "calendar" | "analytics">("list");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Demo Mode Lightswitch state (default to true when isDemoMode is on)
  const [showDemoData, setShowDemoData] = useState<boolean>(isDemoMode);
  const [realPosts, setRealPosts] = useState<SocialPost[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedPostModal, setSelectedPostModal] = useState<SocialPost | null>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<{ dateStr: string; displayDate: string; posts: SocialPost[] } | null>(null);
  // Comments are read live from Zernio per post — nothing is seeded, so an empty
  // stream means the post genuinely has no comments rather than "we made some up".
  const [postComments, setPostComments] = useState<Record<string, SocialComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState<boolean>(false);
  const [newCommentInput, setNewCommentInput] = useState<string>("");

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  // Surfaced in the UI: a failed sync used to be a console.error and an empty list
  // that read as "no posts match your filter".
  const [syncError, setSyncError] = useState<string | null>(null);
  const [deepLinkMiss, setDeepLinkMiss] = useState<string | null>(null);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"posting" | "inbox">("posting");
  const [analyticsPlatformFilter, setAnalyticsPlatformFilter] = useState<string>("all");
  const [analyticsDateRange, setAnalyticsDateRange] = useState<string>("30d");
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["likes", "comments", "shares", "impressions"]);

  // Active posts depending on lightswitch & demo mode
  const posts = useMemo(() => {
    if (isDemoMode && showDemoData) {
      return SAMPLE_POSTS;
    }
    return realPosts;
  }, [isDemoMode, showDemoData, realPosts]);

const normalizePlatformKey = (raw: string): string => {
  const p = (raw || "").toLowerCase();
  if (p.includes("facebook") || p.includes("fb") || p.includes("meta")) return "facebook";
  // Checked before the bare "x" alias so "twitter" and "x" both land here without
  // swallowing every other key that happens to contain an x.
  if (p.includes("twitter") || p === "x" || p === "x_twitter") return "twitter";
  if (p.includes("insta")) return "instagram";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("youtube") || p === "yt") return "youtube";
  if (p.includes("thread")) return "threads";
  if (p.includes("blue")) return "bluesky";
  if (p.includes("pinterest")) return "pinterest";
  if (p.includes("reddit")) return "reddit";
  if (p.includes("google")) return "googlebusiness";
  if (p.includes("telegram")) return "telegram";
  if (p.includes("snap")) return "snapchat";
  if (p.includes("whatsapp")) return "whatsapp";
  if (p.includes("discord")) return "discord";
  return p;
};

// Everything the platform styling needs for a network the view has no palette for.
// Metrics the engagement chart can actually plot. Every entry maps to a field on
// the daily buckets — the old legend had "Reach" and "Clicks" pills whose curves
// were never drawn.
const METRIC_SERIES = [
  { id: "likes", en: "Likes", sk: "Lajky", hu: "Lájkok", stroke: "#f43f5e", pill: "bg-rose-500 text-white" },
  { id: "comments", en: "Comments", sk: "Komentáre", hu: "Kommentek", stroke: "#3b82f6", pill: "bg-blue-500 text-white" },
  { id: "shares", en: "Shares", sk: "Zdieľania", hu: "Megosztások", stroke: "#10b981", pill: "bg-emerald-500 text-white" },
  { id: "impressions", en: "Impressions", sk: "Zobrazenia", hu: "Megjelenések", stroke: "#6366f1", pill: "bg-indigo-500 text-white" },
  { id: "clicks", en: "Clicks", sk: "Kliknutia", hu: "Kattintások", stroke: "#f59e0b", pill: "bg-amber-500 text-white" }
];

const UNKNOWN_PLATFORM = { name: "Other", color: "#64748b", bg: "bg-slate-500", border: "border-slate-400", text: "text-white", icon: "Globe" };
const getPlatformMeta = (key: string) => PLATFORM_CONFIG[key] || UNKNOWN_PLATFORM;

  // Fetch Zernio Data if API Key configured
  const fetchZernioPosts = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      // The API key is never sent from the browser: it is a write-only secret that
      // sync.php masks, and a query string would put it in the server access log.
      // zernio.php resolves the stored key server-side.

      // 1. Fetch connected social accounts from Zernio
      let activeAccList: string[] = [];
      try {
        const accRes = await fetch("/api/zernio.php?action=get_accounts", { cache: "no-store" });
        if (!accRes.ok) throw new Error(`HTTP ${accRes.status}`);
        const accData = await accRes.json();
        if (accData.success && Array.isArray(accData.accounts)) {
          activeAccList = accData.accounts.map((a: any) => normalizePlatformKey(a.platform || a.provider || a.type || ""));
          setConnectedPlatforms(activeAccList);
        } else {
          // A revoked key must not leave the sidebar claiming those networks are live.
          setConnectedPlatforms([]);
          if (accData.message) setSyncError(String(accData.message));
        }
      } catch (e) {
        setConnectedPlatforms([]);
        console.warn("Zernio get_accounts fetch notice:", e);
      }

      // 2. Fetch posts (both native Zernio and platform synced external posts)
      const res = await fetch("/api/zernio.php?action=get_posts", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.success) {
        setSyncError(String(data.message || "Zernio did not return any posts."));
        setRealPosts([]);
        return;
      }
      if (data.partial && Array.isArray(data.warnings) && data.warnings[0]) {
        setSyncError(String(data.warnings[0].message || "Some Zernio sources could not be read."));
      }

      let fetchedPosts: SocialPost[] = [];
      if (Array.isArray(data.posts) && data.posts.length > 0) {
        fetchedPosts = data.posts.map((p: any, idx: number) => {
          const platData = p.platforms?.[0] || {};
          const rawAccount = platData.accountId;
          const accData = (rawAccount && typeof rawAccount === "object") ? rawAccount : {};
          const accountId = typeof rawAccount === "string" ? rawAccount : (accData._id || accData.id || p.accountId || "");
          const platName = platData.platform || p.platform || "";
          const media = (Array.isArray(p.mediaItems) && p.mediaItems.length > 0)
            ? p.mediaItems.map((m: any) => m.url || m.mediaUrl || m.src).filter(Boolean)
            : (p.mediaUrls || (p.media ? [p.media] : (p.imageUrl ? [p.imageUrl] : [])));

          return {
            id: p._id || p.id || `zernio_${idx}`,
            platform: normalizePlatformKey(platName),
            accountId,
            accountName: accData.displayName || accData.name || p.accountName || p.author || p.displayName || "Connected account",
            accountHandle: accData.username ? `@${accData.username}` : (p.accountHandle || p.username || ""),
            content: p.content || p.text || p.caption || "",
            mediaUrls: media,
            status: p.status || "published",
            publishedAt: platData.publishedAt || p.publishedAt || p.scheduledFor || p.createdAt || "",
            scheduledFor: p.scheduledFor,
            platformPostUrl: platData.platformPostUrl || p.platformPostUrl || p.url || p.permalink,
            // ?? not ||: Zernio legitimately reports 0 until the platform's insights
            // land, and a falsy-0 fallback would invent engagement that never happened.
            stats: {
              likes: p.analytics?.likes ?? p.stats?.likes ?? p.likeCount ?? 0,
              comments: p.analytics?.comments ?? p.stats?.comments ?? p.commentsCount ?? 0,
              shares: p.analytics?.shares ?? p.stats?.shares ?? p.retweetCount ?? 0,
              impressions: p.analytics?.impressions ?? p.stats?.views ?? p.viewCount ?? 0,
              clicks: p.analytics?.clicks ?? 0,
              engagementRate: p.analytics?.engagementRate ?? 0
            }
          };
        });

        fetchedPosts.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
      }

      setRealPosts(fetchedPosts);
    } catch (err: any) {
      setSyncError(err?.message ? String(err.message) : String(err));
      console.error("Zernio fetch error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchPostComments = async (post: SocialPost) => {
    // Demo posts have no counterpart upstream; asking Zernio about them would 404.
    if (isDemoMode && showDemoData) {
      setPostComments(prev => ({ ...prev, [post.id]: [] }));
      return;
    }
    if (!post.accountId) {
      setCommentsError(t(
        "This post has no connected account, so its comments cannot be read.",
        "Tento príspevok nemá pripojený účet, komentáre sa nedajú načítať.",
        "Ehhez a bejegyzéshez nincs csatlakoztatott fiók, a kommentek nem olvashatók."
      ));
      return;
    }
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await fetch(
        `/api/zernio.php?action=get_comments&postId=${encodeURIComponent(post.id)}&accountId=${encodeURIComponent(post.accountId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) {
        setCommentsError(String(data.message || "Could not load comments."));
        return;
      }
      const raw = Array.isArray(data.comments) ? data.comments : [];
      const mapped: SocialComment[] = raw.map((c: any, idx: number) => ({
        id: String(c.id ?? c._id ?? `c_${idx}`),
        author: c.from?.name || c.from?.username || c.author || "Unknown",
        handle: c.from?.username ? `@${c.from.username}` : "",
        text: c.message ?? c.text ?? "",
        time: c.createdTime || c.created_at || "",
        likes: Number(c.likeCount ?? 0) || 0
      }));
      setPostComments(prev => ({ ...prev, [post.id]: mapped }));
    } catch (err: any) {
      setCommentsError(err?.message ? String(err.message) : String(err));
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const post = selectedPostModal;
    const message = newCommentInput.trim();
    if (!post || !message || isPostingComment) return;
    if (!post.accountId) return;

    setIsPostingComment(true);
    try {
      const res = await fetch("/api/zernio.php?action=reply_comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, accountId: post.accountId, message })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) {
        (window as any).showToast?.(
          data.message || t("Reply could not be sent.", "Odpoveď sa nepodarilo odoslať.", "A válasz elküldése nem sikerült."),
          "error"
        );
        return;
      }
      setNewCommentInput("");
      (window as any).showToast?.(t("Reply published.", "Odpoveď bola zverejnená.", "A válasz közzétéve."));
      // Re-read the thread so what is on screen is what the platform actually has.
      await fetchPostComments(post);
    } catch (err: any) {
      (window as any).showToast?.(
        t("Network error sending the reply.", "Sieťová chyba pri odosielaní odpovede.", "Hálózati hiba a válasz küldésekor."),
        "error"
      );
      console.error("Zernio reply error:", err);
    } finally {
      setIsPostingComment(false);
    }
  };

  useEffect(() => {
    fetchZernioPosts();
  }, [integrationsConfig?.zernioConnected, showDemoData]);

  // Hash Navigation Listener for linkable post URLs (#social_media/post/{postId})
  useEffect(() => {
    const parseHashPost = () => {
      const hash = window.location.hash;
      // Leaving the deep link (Back button, or navigating to the hub) has to close
      // the detail view — without the else branch it stayed open over the hub.
      if (!hash.includes("/post/")) {
        setSelectedPostModal(null);
        setDeepLinkMiss(null);
        return;
      }
      const targetId = hash.split("/post/")[1];
      const found = targetId ? posts.find(p => p.id === targetId) : undefined;
      setSelectedPostModal(found ?? null);
      setDeepLinkMiss(found ? null : (targetId || null));
    };
    parseHashPost();
    window.addEventListener("hashchange", parseHashPost);
    return () => window.removeEventListener("hashchange", parseHashPost);
  }, [posts]);

  const handleOpenPostDetails = (post: SocialPost) => {
    setSelectedPostModal(post);
    setDeepLinkMiss(null);
    setNewCommentInput("");
    setCommentsError(null);
    window.location.hash = `social_media/post/${post.id}`;
    fetchPostComments(post);
  };

  const handleClosePostDetails = () => {
    setSelectedPostModal(null);
    setDeepLinkMiss(null);
    window.location.hash = "social_media";
  };

  // A deep link that arrives before the posts finish loading, or points at a post
  // that no longer exists, gets an explicit panel instead of a blank hub.
  useEffect(() => {
    if (selectedPostModal) {
      fetchPostComments(selectedPostModal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostModal?.id]);

  const isConnected = Boolean(integrationsConfig?.zernioConnected || integrationsConfig?.zernioApiKey) || (isDemoMode && showDemoData);
  const hasActiveFilters = selectedPlatform !== "all" || selectedStatus !== "all" || Boolean(searchQuery.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedCalendarDay) setSelectedCalendarDay(null);
      else if (selectedPostModal) handleClosePostDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCalendarDay, selectedPostModal]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesPlatform = selectedPlatform === "all" || post.platform === selectedPlatform;
      const matchesStatus = selectedStatus === "all" || post.status === selectedStatus;
      const matchesSearch = !searchQuery.trim() || 
        (post.content || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (post.accountName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (post.accountHandle || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPlatform && matchesStatus && matchesSearch;
    });
  }, [posts, selectedPlatform, selectedStatus, searchQuery]);

  // Group posts by day for chronological list view
  const groupedByDayPosts = useMemo(() => {
    const sorted = [...filteredPosts].sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.scheduledFor || 0).getTime();
      const dateB = new Date(b.publishedAt || b.scheduledFor || 0).getTime();
      return dateB - dateA;
    });

    const groups: Record<string, SocialPost[]> = {};
    sorted.forEach(post => {
      const rawDate = post.publishedAt || post.scheduledFor || new Date().toISOString();
      const dateKey = rawDate.split("T")[0]; // YYYY-MM-DD
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(post);
    });

    return Object.entries(groups).map(([date, postList]) => ({ date, posts: postList }));
  }, [filteredPosts]);

  // The Analytics view has its own platform + date-range filters. They used to set
  // state nothing read; every widget below now derives from this one dataset so the
  // KPI cards, charts and tables can never disagree with each other.
  const analyticsPosts = useMemo(() => {
    const days = analyticsDateRange === "7d" ? 7 : analyticsDateRange === "90d" ? 90 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return filteredPosts.filter(post => {
      if (analyticsPlatformFilter !== "all" && post.platform !== analyticsPlatformFilter) return false;
      const raw = post.publishedAt || post.scheduledFor;
      // Drafts carry no date at all — keep them rather than silently dropping them.
      if (!raw) return true;
      const ts = new Date(raw).getTime();
      return Number.isNaN(ts) ? true : ts >= cutoff;
    });
  }, [filteredPosts, analyticsPlatformFilter, analyticsDateRange]);

  // Platforms actually present in the data or connected upstream — not the full
  // palette, which made every table claim 15 channels on a single-account tenant.
  const activePlatformKeys = useMemo(() => {
    const keys = new Set<string>();
    posts.forEach(p => { if (p.platform) keys.add(p.platform); });
    connectedPlatforms.forEach(k => { if (k) keys.add(k); });
    return Array.from(keys);
  }, [posts, connectedPlatforms]);

  const analyticsPlatformKeys = useMemo(() => {
    const keys = new Set<string>();
    analyticsPosts.forEach(p => { if (p.platform) keys.add(p.platform); });
    return Array.from(keys);
  }, [analyticsPosts]);

  // Calculate Overall Analytics KPIs
  const analyticsKpis = useMemo(() => {
    const src = analyticsPosts;
    const totalImpressions = src.reduce((acc, p) => acc + (p.stats.impressions || 0), 0);
    const totalLikes = src.reduce((acc, p) => acc + (p.stats.likes || 0), 0);
    const totalComments = src.reduce((acc, p) => acc + (p.stats.comments || 0), 0);
    const totalShares = src.reduce((acc, p) => acc + (p.stats.shares || 0), 0);
    const totalClicks = src.reduce((acc, p) => acc + (p.stats.clicks || 0), 0);
    const totalEngagement = totalLikes + totalComments + totalShares;
    // Prefer a computed rate over the per-post one, which is 0 until the platform
    // reports insights; fall back to impressions-based engagement.
    const avgRate = totalImpressions > 0
      ? ((totalEngagement / totalImpressions) * 100).toFixed(1)
      : "0.0";

    return {
      totalImpressions,
      totalLikes,
      totalComments,
      totalShares,
      totalClicks,
      totalEngagement,
      avgRate,
      postCount: src.length,
      publishedCount: src.filter(p => p.status === "published").length,
      scheduledCount: src.filter(p => p.status === "scheduled").length
    };
  }, [analyticsPosts]);

  // Daily buckets across the selected range — the source for every time series.
  const analyticsDailySeries = useMemo(() => {
    const days = analyticsDateRange === "7d" ? 7 : analyticsDateRange === "90d" ? 90 : 30;
    // 90 days of individual bars is unreadable; bucket the long ranges by week.
    const bucketDays = days > 31 ? 7 : 1;
    const bucketCount = Math.ceil(days / bucketDays);
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const bucketMs = bucketDays * 24 * 60 * 60 * 1000;

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const end = endOfToday - (bucketCount - 1 - i) * bucketMs;
      return {
        start: end - bucketMs + 1,
        end,
        label: new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0
      };
    });

    analyticsPosts.forEach(p => {
      const raw = p.publishedAt || p.scheduledFor;
      if (!raw) return;
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return;
      const b = buckets.find(x => ts >= x.start && ts <= x.end);
      if (!b) return;
      b.posts += 1;
      b.likes += p.stats.likes || 0;
      b.comments += p.stats.comments || 0;
      b.shares += p.stats.shares || 0;
      b.impressions += p.stats.impressions || 0;
      b.clicks += p.stats.clicks || 0;
    });

    return buckets;
  }, [analyticsPosts, analyticsDateRange]);

  // Draw at most ~8 date labels regardless of bucket count, so a 30-day range
  // does not collapse every label into an ellipsis.
  const labelEvery = Math.max(1, Math.ceil(analyticsDailySeries.length / 8));

  // Publishing activity by weekday x 2-hour block, weighted by engagement, so the
  // "best time" grid reflects this tenant's own posts instead of a fixed pattern.
  const postingHeatmap = useMemo(() => {
    const grid: Array<Array<{ posts: number; engagement: number }>> =
      Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => ({ posts: 0, engagement: 0 })));
    let max = 0;
    analyticsPosts.forEach(p => {
      const raw = p.publishedAt || p.scheduledFor;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      // Monday-first, matching the row labels.
      const dayIdx = (d.getDay() + 6) % 7;
      const blockIdx = Math.floor(d.getHours() / 2);
      const cell = grid[dayIdx][blockIdx];
      cell.posts += 1;
      cell.engagement += (p.stats.likes || 0) + (p.stats.comments || 0) + (p.stats.shares || 0);
      if (cell.engagement > max) max = cell.engagement;
    });

    let bestLabel = "";
    let bestScore = -1;
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    grid.forEach((row, dIdx) => row.forEach((cell, bIdx) => {
      if (cell.posts > 0 && cell.engagement > bestScore) {
        bestScore = cell.engagement;
        bestLabel = `${dayNames[dIdx]} ${String(bIdx * 2).padStart(2, "0")}:00`;
      }
    }));

    return { grid, max, bestLabel };
  }, [analyticsPosts]);

  // The table header promised "sorted by highest engagement rate" while rendering
  // publish order; rank explicitly instead of relabelling the header.
  const rankedPosts = useMemo(() => {
    const score = (p: SocialPost) =>
      p.stats.engagementRate || (p.stats.impressions > 0
        ? ((p.stats.likes + p.stats.comments + p.stats.shares) / p.stats.impressions) * 100
        : p.stats.likes + p.stats.comments + p.stats.shares);
    return [...analyticsPosts].sort((a, b) => score(b) - score(a));
  }, [analyticsPosts]);

  // Calendar Day Generation
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday

    const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean; posts: SocialPost[] }> = [];

    // Previous month padding. `month` is 0-based, so the previous month's 1-based
    // number is `month` itself — except in January, where it rolls to December of
    // the prior year (the old code emitted "-00-" there).
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevY = prevMonthDate.getFullYear();
    const prevM = prevMonthDate.getMonth() + 1;
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
        dayNum: prevMonthLastDay - i,
        isCurrentMonth: false,
        posts: []
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayPosts = filteredPosts.filter(p => {
        const pDate = (p.publishedAt || p.scheduledFor || "").split("T")[0];
        return pDate === dateStr;
      });
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        posts: dayPosts
      });
    }

    // Trailing padding so the final week is a full row rather than a ragged edge.
    const nextMonthDate = new Date(year, month + 1, 1);
    const nextY = nextMonthDate.getFullYear();
    const nextM = nextMonthDate.getMonth() + 1;
    let trailing = 1;
    while (days.length % 7 !== 0) {
      days.push({
        dateStr: `${nextY}-${String(nextM).padStart(2, '0')}-${String(trailing).padStart(2, '0')}`,
        dayNum: trailing,
        isCurrentMonth: false,
        posts: []
      });
      trailing++;
    }

    return days;
  }, [calendarDate, filteredPosts]);

  const renderAuthenticSocialCard = (post: SocialPost) => {
    const rawDate = post.publishedAt || post.scheduledFor || new Date().toISOString();
    const formattedTime = new Date(rawDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const platMeta = getPlatformMeta(post.platform);

    if (post.platform === "twitter") {
      return (
        <div key={post.id} className="bg-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 font-sans select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-extrabold flex items-center justify-center text-sm border border-slate-700">
                𝕏
              </div>
              <div>
                <div className="flex items-center gap-1 font-bold text-sm text-white">
                  <span>{post.accountName}</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 fill-sky-400" />
                </div>
                <span className="text-xs text-slate-400">{post.accountHandle} • {formattedTime}</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
              {post.status}
            </span>
          </div>

          <p className="text-sm font-normal text-slate-100 leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>

          {post.mediaUrls && post.mediaUrls.length > 0 && (
            <div className="rounded-2xl overflow-hidden max-h-64 border border-slate-800">
              <img src={post.mediaUrls[0]} alt="Media" referrerPolicy="no-referrer" className="w-full h-52 object-cover" />
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-slate-400 text-xs font-mono">
            <span className="flex items-center gap-1 hover:text-sky-400"><MessageSquare className="h-3.5 w-3.5" /> {post.stats.comments}</span>
            <span className="flex items-center gap-1 hover:text-emerald-400"><Repeat className="h-3.5 w-3.5" /> {post.stats.shares}</span>
            <span className="flex items-center gap-1 hover:text-rose-500"><Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" /> {post.stats.likes}</span>
            <span className="flex items-center gap-1 hover:text-sky-400"><Eye className="h-3.5 w-3.5" /> {post.stats.impressions}</span>
            <Bookmark className="h-3.5 w-3.5 hover:text-sky-400" />
          </div>
        </div>
      );
    }

    if (post.platform === "instagram") {
      return (
        <div key={post.id} className="bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-md overflow-hidden font-sans space-y-3 pb-4 select-none">
          <div className="p-4 pb-0 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-0.5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
                <div className="w-8 h-8 rounded-full bg-white p-0.5 flex items-center justify-center font-bold text-xs">
                  📸
                </div>
              </div>
              <div>
                <span className="text-xs font-black text-slate-900 block">{post.accountHandle}</span>
                <span className="text-[10px] text-slate-400 block">{formattedTime}</span>
              </div>
            </div>
            <MoreHorizontal className="h-4 w-4 text-slate-400" />
          </div>

          {post.mediaUrls && post.mediaUrls.length > 0 ? (
            <img src={post.mediaUrls[0]} alt="Instagram photo" referrerPolicy="no-referrer" className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-40 bg-gradient-to-tr from-purple-600 to-rose-500 flex items-center justify-center text-white font-extrabold text-xs p-4 text-center">
              "{post.content}"
            </div>
          )}

          <div className="px-4 space-y-2">
            <div className="flex items-center justify-between text-slate-700">
              <div className="flex items-center gap-3">
                <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                <MessageSquare className="h-4 w-4 hover:text-slate-900" />
                <Send className="h-4 w-4 hover:text-slate-900" />
              </div>
              <Bookmark className="h-4 w-4 hover:text-slate-900" />
            </div>

            <div className="text-[11px] font-extrabold text-slate-900">
              Liked by ccrm_team and {post.stats.likes} others
            </div>

            <p className="text-xs text-slate-800 leading-snug break-words">
              <strong className="font-black text-slate-900 mr-1.5">{post.accountHandle}</strong>
              {post.content}
            </p>
          </div>
        </div>
      );
    }

    if (post.platform === "linkedin") {
      return (
        <div key={post.id} className="bg-white text-slate-900 rounded-3xl p-5 border border-slate-200 shadow-md font-sans space-y-3.5 select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-700 text-white font-black flex items-center justify-center text-sm shadow-sm">
                in
              </div>
              <div>
                <span className="text-xs font-black text-slate-900 block">{post.accountName} • 1st</span>
                <span className="text-[10px] text-slate-400 block">CRM Automation Engine • {formattedTime}</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              {post.status}
            </span>
          </div>

          <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap break-words">
            {post.content}
          </p>

          {post.mediaUrls && post.mediaUrls.length > 0 && (
            <div className="rounded-2xl overflow-hidden max-h-56 border border-slate-200">
              <img src={post.mediaUrls[0]} alt="LinkedIn attachment" referrerPolicy="no-referrer" className="w-full h-44 object-cover" />
            </div>
          )}

          <div className="pt-2 border-t border-slate-150 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1 text-blue-600">
              👍 ❤️ 💡 {post.stats.likes} reactions
            </span>
            <span>{post.stats.comments} comments</span>
          </div>

        </div>
      );
    }

    return (
      <div key={post.id} className="bg-white text-slate-900 rounded-3xl p-5 border border-slate-200 shadow-md font-sans space-y-3.5 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${platMeta.bg} ${platMeta.text} shadow-sm`}>
              {platMeta.name}
            </span>
            <div>
              <span className="text-xs font-black text-slate-900 block">{post.accountHandle}</span>
              <span className="text-[10px] text-slate-400 block">{formattedTime}</span>
            </div>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
            post.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
          }`}>
            {post.status}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
          {post.content}
        </p>

        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className="rounded-2xl overflow-hidden max-h-56 border border-slate-200">
            <img src={post.mediaUrls[0]} alt="Media attachment" referrerPolicy="no-referrer" className="w-full h-44 object-cover" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {selectedPostModal ? (
        /* DEDICATED FULL VIEW: LINKABLE POST DETAILS & COMMENTS FEED */
        <div className="space-y-6 animate-fade-in select-none">
          {/* Header Navigation Bar — same title-block + actions shape as the hub view */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClosePostDetails}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer shrink-0"
                title={t("Back to Social Media Hub", "Späť na Správu sociálnych sietí", "Vissza a Közösségi Média Hubhoz")}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex flex-col">
                <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Share2 className="h-6 w-6 text-rose-600" />
                  {t("Post Details", "Detail príspevku", "Bejegyzés részletei")}
                </h1>
                <p className="text-xs text-slate-500 font-mono font-semibold tracking-wider mt-1">
                  #social_media/post/{selectedPostModal.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  const fullUrl = `${window.location.origin}${window.location.pathname}#social_media/post/${selectedPostModal.id}`;
                  try {
                    // navigator.clipboard is undefined on plain-http origins, so the
                    // success toast used to fire while nothing was copied.
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(fullUrl);
                    } else {
                      const ta = document.createElement("textarea");
                      ta.value = fullUrl;
                      ta.style.position = "fixed";
                      ta.style.opacity = "0";
                      document.body.appendChild(ta);
                      ta.select();
                      const ok = document.execCommand("copy");
                      document.body.removeChild(ta);
                      if (!ok) throw new Error("copy command rejected");
                    }
                    (window as any).showToast?.(t("Post link copied to clipboard!", "Odkaz na príspevok bol skopírovaný!", "Bejegyzés hivatkozás másolva!"));
                  } catch {
                    (window as any).showToast?.(t("Could not copy the link.", "Odkaz sa nepodarilo skopírovať.", "A hivatkozást nem sikerült másolni."), "error");
                  }
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Share2 className="h-4 w-4" />
                {t("Copy CCRM Link", "Kopírovať odkaz", "Link másolása")}
              </button>
            </div>
          </div>

          {/* 2-COLUMN MAIN WORKSPACE VIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN (7 Cols): Authentic Native Post Card & Comprehensive Analytics */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Authentic Platform Card (Styled exactly like Twitter/X, Instagram, LinkedIn, etc.) */}
              <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">
                    {t("AUTHENTIC PLATFORM CARD", "NÁHĽAD V DIZAJNE PLATFORMY", "EREDETI PLATFORM BEJEGYZÉS NÉZET")}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider ${
                    selectedPostModal.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                  }`}>
                    {selectedPostModal.status}
                  </span>
                </div>

                {/* Render Authentic Card */}
                {renderAuthenticSocialCard(selectedPostModal)}
              </div>

              {/* Performance Analytics Breakdown */}
              <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-5">
                <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-500" />
                    <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider">
                      {t("Post Performance Analytics", "Analytika výkonu príspevku", "Bejegyzés teljesítmény analitika")}
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                    {selectedPostModal.stats.engagementRate}% Engagement
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Likes</span>
                    <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{selectedPostModal.stats.likes}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Comments</span>
                    <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{selectedPostModal.stats.comments}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Shares</span>
                    <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{selectedPostModal.stats.shares}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Impressions</span>
                    <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{selectedPostModal.stats.impressions}</span>
                  </div>
                </div>

                {selectedPostModal.platformPostUrl && (
                  <div className="pt-2">
                    <a
                      href={selectedPostModal.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("View Original Post on", "Pozrieť originálny príspevok na", "Eredeti bejegyzés megtekintése:")} {getPlatformMeta(selectedPostModal.platform).name}
                    </a>
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT COLUMN (5 Cols): Interactive Comments Stream & Reply Composer */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-5 min-h-[550px] flex flex-col justify-between">
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-rose-500" />
                      <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider">
                        {t("Post Comments Stream", "Stream komentárov", "Komment folyam")} ({(postComments[selectedPostModal.id] || []).length})
                      </h3>
                    </div>
                    {commentsLoading && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        {t("Loading", "Načítavam", "Betöltés")}
                      </span>
                    )}
                  </div>

                  {/* Comment Feed Items */}
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {commentsError ? (
                      <div className="p-6 text-center bg-rose-50/80 rounded-2xl border border-rose-200/80 text-xs text-rose-700 space-y-2">
                        <MessageSquare className="h-8 w-8 text-rose-300 mx-auto" />
                        <p className="font-bold">{t("Comments could not be loaded.", "Komentáre sa nepodarilo načítať.", "A kommenteket nem sikerült betölteni.")}</p>
                        <p className="font-medium text-rose-600 break-words">{commentsError}</p>
                      </div>
                    ) : commentsLoading ? (
                      <div className="p-10 text-center bg-slate-50/80 rounded-2xl border border-slate-200/80 text-xs text-slate-400 space-y-2">
                        <RefreshCw className="h-8 w-8 text-slate-300 mx-auto animate-spin" />
                        <p className="font-semibold">{t("Loading comments…", "Načítavam komentáre…", "Kommentek betöltése…")}</p>
                      </div>
                    ) : (!postComments[selectedPostModal.id] || postComments[selectedPostModal.id].length === 0) ? (
                      <div className="p-10 text-center bg-slate-50/80 rounded-2xl border border-slate-200/80 text-xs text-slate-400 space-y-2">
                        <MessageSquare className="h-8 w-8 text-slate-300 mx-auto" />
                        <p className="font-semibold">{t("No comments on this post yet.", "Zatiaľ žiadne komentáre k tomuto príspevku.", "Még nincsenek kommentek.")}</p>
                      </div>
                    ) : (
                      postComments[selectedPostModal.id].map(comment => (
                        <div key={comment.id} className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/90 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shadow-xs">
                                {(comment.author || "?").charAt(0)}
                              </div>
                              <div>
                                <span className="text-xs font-black text-slate-900 block">{comment.author}</span>
                                <span className="text-[10px] text-slate-400 font-medium">{comment.handle}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold">{comment.time}</span>
                          </div>

                          <p className="text-xs text-slate-800 font-medium pl-9 leading-relaxed break-words">
                            {comment.text}
                          </p>

                          {/* Read-only meta. Liking a comment is a separate Zernio
                              scope this integration does not request, so these are
                              deliberately not styled as controls. */}
                          <div className="pl-9 pt-1 flex items-center gap-4 text-[10.5px] font-extrabold text-slate-400">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3.5 w-3.5" /> {comment.likes}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reply composer — posts to the platform through
                    POST /v1/inbox/comments/{postId}. Disabled when the post has no
                    connected account, since there is nothing to reply through. */}
                <form
                  onSubmit={handleSubmitComment}
                  className="pt-4 border-t border-slate-150 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={newCommentInput}
                      onChange={(e) => setNewCommentInput(e.target.value)}
                      disabled={!selectedPostModal.accountId || isPostingComment}
                      placeholder={
                        selectedPostModal.accountId
                          ? t("Write a comment or reply...", "Napíšte komentár...", "Írjon kommentet...")
                          : t("Replying needs a connected account", "Odpovedanie vyžaduje pripojený účet", "A válaszhoz csatlakoztatott fiók kell")
                      }
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="submit"
                      disabled={!selectedPostModal.accountId || isPostingComment || !newCommentInput.trim()}
                      aria-label={t("Send reply", "Odoslať odpoveď", "Válasz küldése")}
                      title={t("Send reply", "Odoslať odpoveď", "Válasz küldése")}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPostingComment ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {t(
                      "Replies are published on the social network through Zernio.",
                      "Odpovede sa zverejnia na sociálnej sieti cez Zernio.",
                      "A válaszok a Zernión keresztül jelennek meg a közösségi hálózaton."
                    )}
                  </p>
                </form>

              </div>
            </div>

          </div>
        </div>
      ) : deepLinkMiss && !isSyncing ? (
        /* A shared link pointing at a post this workspace cannot see. Without this
           branch the hub rendered as if nothing had been requested. */
        <div className="glass-panel p-12 text-center rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-base font-heading font-extrabold text-slate-900">
            {t("Post not found", "Príspevok sa nenašiel", "A bejegyzés nem található")}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto break-words">
            {t(
              "This link points to a post that is no longer available in the connected accounts.",
              "Tento odkaz vedie na príspevok, ktorý už v pripojených účtoch nie je dostupný.",
              "Ez a hivatkozás olyan bejegyzésre mutat, amely már nem érhető el a csatlakoztatott fiókokban."
            )}
          </p>
          <button
            type="button"
            onClick={handleClosePostDetails}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("Back to Social Media Hub", "Späť na sociálne siete", "Vissza a Közösségi Média Hubhoz")}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* HEADER SECTION — same shape as every other module: title block on the
              left, actions on the right, hairline rule underneath. This view used to
              paint its own glass hero bar with a gradient badge, which read as a
              second header competing with the app header above it. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex flex-col">
              <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Share2 className="h-6 w-6 text-rose-600" />
                {t("Social Media Hub", "Správa sociálnych sietí", "Közösségi Média Hub")}
              </h1>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
                {t(
                  "Multi-channel post manager, scheduled calendar & engagement analytics across 15+ networks.",
                  "Multikanálový správca príspevkov, kalendár plánovania a analytika dosahu na 15+ sieťach.",
                  "Többcsatornás bejegyzéskezelő, ütemezési naptár és eléréselemzés."
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Lightswitch for Demo Mode (Only rendered when isDemoMode is true) */}
              {isDemoMode && (
                <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80 select-none gap-1">
                  <button
                    type="button"
                    onClick={() => setShowDemoData(false)}
                    className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                      !showDemoData
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Zap className="h-4 w-4 text-emerald-600" />
                    {t("Real Data", "Živé dáta", "Élő adatok")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDemoData(true)}
                    className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                      showDemoData
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    {t("Demo Data", "Demo dáta", "Demo adatok")}
                  </button>
                </div>
              )}

              {/* View Switcher Tabs (3 top views) */}
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setActiveView("list")}
                  className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeView === "list"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <List className="h-4 w-4 text-rose-500" />
                  {t("List View", "Zoznam", "Lista nézet")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("calendar")}
                  className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeView === "calendar"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  {t("Calendar View", "Kalendár", "Naptár nézet")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("analytics")}
                  className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeView === "analytics"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  {t("Analytics View", "Analytika", "Analitika nézet")}
                </button>
              </div>
            </div>
          </div>

      {/* A failed Zernio sync used to be a console.error only — the section just
          looked empty. Surface it where the data should have been. */}
      {syncError && isConnected && !(isDemoMode && showDemoData) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 flex items-start gap-3">
          <Zap className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-black text-rose-800 uppercase tracking-wider">
              {t("Zernio sync problem", "Problém so synchronizáciou Zernio", "Zernio szinkronizálási hiba")}
            </p>
            <p className="text-xs text-rose-700 font-medium break-words">{syncError}</p>
          </div>
        </div>
      )}

      {/* Main Workspace Grid (Left Sidebar + Center Content) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT SIDEBAR MENU: Filter by Platform / Source & Status */}
        <div className="lg:col-span-3 space-y-4 lg:sticky lg:top-24 select-none">
          <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-5">
            <div>
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">
                {t("SEARCH POSTS", "HĽADAŤ PRÍSPEVKY", "KERESÉS BEJEGYZÉSEKBEN")}
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Filter by text or handle...", "Filtrovať podľa textu...", "Szűrés szöveg alapján...")}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>

            {/* Social Network Source Filter Menu */}
            <div>
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">
                {t("FILTER BY SOURCE", "FILTROVAŤ PODĽA ZDROJA", "SZŰRÉS FORRÁS ALAPJÁN")}
              </span>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedPlatform("all")}
                  className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-between cursor-pointer ${
                    selectedPlatform === "all"
                      ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    {t("All Social Media", "Všetky siete", "Összes közösségi média")}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedPlatform === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {posts.length}
                  </span>
                </button>

                {activePlatformKeys
                  .map((platKey) => {
                    const platData = getPlatformMeta(platKey);
                    const count = posts.filter(p => p.platform === platKey).length;
                    const isSelected = selectedPlatform === platKey;
                    return (
                      <button
                        key={platKey}
                        type="button"
                        onClick={() => setSelectedPlatform(platKey)}
                        className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-slate-900 text-white shadow-md"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className={`w-2.5 h-2.5 rounded-full ${platData.bg}`}></span>
                          <span className="truncate">{platData.name}</span>
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Filter by Status */}
            <div className="pt-3 border-t border-slate-150">
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">
                {t("POST STATUS", "STAV PRÍSPEVKU", "BEJEGYZÉS ÁLLAPOTA")}
              </span>
              <div className="space-y-1">
                {[
                  { id: "all", label: t("All Statuses", "Všetky stavy", "Minden állapot") },
                  { id: "published", label: t("Published", "Publikované", "Közzétéve") },
                  { id: "scheduled", label: t("Scheduled", "Naplánované", "Ütemezve") },
                  { id: "draft", label: t("Drafts", "Koncepty", "Vázlatok") }
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStatus(st.id)}
                    className={`w-full text-left px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      selectedStatus === st.id
                        ? "bg-slate-100 text-slate-900 font-black border border-slate-200"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>{st.label}</span>
                    {selectedStatus === st.id && <CheckCircle2 className="h-3.5 w-3.5 text-rose-500" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Zernio Quick Sync Action */}
            <div className="pt-3 border-t border-slate-150">
              <button
                type="button"
                onClick={() => {
                  // Syncing writes into realPosts, which the demo lightswitch hides.
                  if (isDemoMode && showDemoData) setShowDemoData(false);
                  fetchZernioPosts();
                }}
                disabled={isSyncing}
                title={t("Fetch posts and connected accounts from Zernio", "Načítať príspevky a pripojené účty zo Zernia", "Bejegyzések és fiókok letöltése a Zernióból")}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-rose-400" : "text-white"}`} />
                {t("Sync Accounts", "Synch. účty", "Fiókok szinkronizálása")}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER CONTENT: Views (List, Calendar, Analytics) */}
        <div className="lg:col-span-9 space-y-6">

          {/* ============================================================ */}
          {/* VIEW 1: LIST VIEW (Default - Grouped Same-Day Cards)        */}
          {/* ============================================================ */}
          {activeView === "list" && (
            <div className="space-y-8">
              {groupedByDayPosts.length === 0 ? (
                /* Three genuinely different reasons for an empty list. Blaming the
                   filters for all three sent users hunting a filter they never set. */
                <div className="glass-panel p-12 text-center rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                    <Share2 className="h-6 w-6" />
                  </div>
                  {isSyncing ? (
                    <>
                      <h3 className="text-base font-heading font-extrabold text-slate-900">
                        {t("Loading posts…", "Načítavam príspevky…", "Bejegyzések betöltése…")}
                      </h3>
                    </>
                  ) : !isConnected ? (
                    <>
                      <h3 className="text-base font-heading font-extrabold text-slate-900">
                        {t("Zernio is not connected yet", "Zernio zatiaľ nie je pripojené", "A Zernio még nincs csatlakoztatva")}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {t(
                          "Connect a Zernio API key in Settings → Social Media to load posts from your social accounts.",
                          "Pripojte Zernio API kľúč v Nastavenia → Sociálne siete, aby sa načítali príspevky z vašich účtov.",
                          "Csatlakoztasson egy Zernio API kulcsot a Beállítások → Közösségi média menüben."
                        )}
                      </p>
                    </>
                  ) : syncError ? (
                    <>
                      <h3 className="text-base font-heading font-extrabold text-slate-900">
                        {t("Posts could not be loaded", "Príspevky sa nepodarilo načítať", "A bejegyzéseket nem sikerült betölteni")}
                      </h3>
                      <p className="text-xs text-rose-600 max-w-sm mx-auto font-semibold break-words">{syncError}</p>
                    </>
                  ) : hasActiveFilters ? (
                    <>
                      <h3 className="text-base font-heading font-extrabold text-slate-900">
                        {t("No posts found matching filter", "Nenašli sa žiadne príspevky", "Nem található bejegyzés")}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {t("Try selecting another social media source or clearing search filters.", "Skúste zmeniť filter alebo vyhľadávanie.", "Próbálja meg módosítani a szűrőt.")}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-base font-heading font-extrabold text-slate-900">
                        {t("No posts on the connected accounts yet", "Pripojené účty zatiaľ nemajú príspevky", "A csatlakoztatott fiókokban még nincsenek bejegyzések")}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {t("Published and scheduled posts appear here as soon as Zernio syncs them.", "Publikované a naplánované príspevky sa tu zobrazia hneď po synchronizácii.", "A közzétett és ütemezett bejegyzések a szinkronizálás után jelennek meg.")}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                groupedByDayPosts.map(({ date, posts: dayPosts }) => {
                  const displayDate = new Date(date).toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });

                  return (
                    <div key={date} className="space-y-4">
                      {/* Date Banner for Same-Day Grouping */}
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                          <Calendar className="h-3.5 w-3.5 text-rose-400" />
                          {displayDate}
                        </div>
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                          {dayPosts.length} {t("Posts", "Príspevkov", "Bejegyzés")}
                        </span>
                      </div>

                      {/* Same-Day Cards Grid Layout */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {dayPosts.map((post) => {
                          const platformMeta = getPlatformMeta(post.platform);
                          return (
                            <div
                              key={post.id}
                              onClick={() => handleOpenPostDetails(post)}
                              className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between space-y-4 relative group cursor-pointer"
                            >
                              <div>
                                {/* Post Top Meta Header */}
                                <div className="flex items-center justify-between gap-2 border-b border-slate-150 pb-3 mb-3">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${platformMeta.bg} ${platformMeta.text} shadow-sm shrink-0`}>
                                      {platformMeta.name}
                                    </span>
                                    <span className="text-xs font-black text-slate-900 truncate">
                                      {post.accountHandle}
                                    </span>
                                  </div>

                                  {/* Status Pill */}
                                  <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider shrink-0 ${
                                    post.status === "published" 
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                                      : post.status === "scheduled" 
                                        ? "bg-indigo-100 text-indigo-800 border border-indigo-200" 
                                        : "bg-slate-100 text-slate-700 border border-slate-200"
                                  }`}>
                                    {post.status}
                                  </span>
                                </div>

                                {/* Media Thumbnail Preview (if attached) */}
                                {post.mediaUrls && post.mediaUrls.length > 0 && (
                                  <div className="mb-3 rounded-2xl overflow-hidden max-h-48 relative group/img border border-slate-200">
                                    <img
                                      src={post.mediaUrls[0]}
                                      alt="Post attachment"
                                      referrerPolicy="no-referrer"
                                      className="w-full h-40 object-cover group-hover/img:scale-105 transition-transform duration-300"
                                    />
                                    {post.mediaType === "video" && (
                                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                        <div className="w-10 h-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center font-bold text-xs shadow-lg">
                                          ▶
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Post Text Content */}
                                <p className="text-xs font-semibold text-slate-800 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                  {post.content}
                                </p>
                              </div>

                              {/* Base Stats Footer (Zernio Specs) */}
                              <div className="pt-3 border-t border-slate-150 space-y-2">
                                <div className="grid grid-cols-4 gap-1 text-center bg-slate-50 p-2 rounded-2xl border border-slate-150">
                                  <div title="Likes / Reactions">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block flex items-center justify-center gap-1">
                                      <Heart className="h-3 w-3 text-rose-500" />
                                    </span>
                                    <span className="text-xs font-black text-slate-800">{post.stats.likes}</span>
                                  </div>
                                  <div title="Comments">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block flex items-center justify-center gap-1">
                                      <MessageSquare className="h-3 w-3 text-blue-500" />
                                    </span>
                                    <span className="text-xs font-black text-slate-800">{post.stats.comments}</span>
                                  </div>
                                  <div title="Shares / Retweets">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block flex items-center justify-center gap-1">
                                      <Repeat className="h-3 w-3 text-emerald-500" />
                                    </span>
                                    <span className="text-xs font-black text-slate-800">{post.stats.shares}</span>
                                  </div>
                                  <div title="Impressions / Views">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block flex items-center justify-center gap-1">
                                      <Eye className="h-3 w-3 text-indigo-500" />
                                    </span>
                                    <span className="text-xs font-black text-slate-800">{post.stats.impressions}</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-500">
                                  <span>{t("Engagement:", "Engažovanosť:", "Kötődés:")} <strong className="text-emerald-600 font-mono">{post.stats.engagementRate}%</strong></span>
                                  {post.platformPostUrl && (
                                    <a
                                      href={post.platformPostUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-indigo-600 hover:text-indigo-800 font-extrabold flex items-center gap-1 hover:underline"
                                    >
                                      {t("View", "Pozrieť", "Megtekintés")} <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW 2: CALENDAR VIEW                                        */}
          {/* ============================================================ */}
          {activeView === "calendar" && (
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-6">
              {/* Calendar Header Controls */}
              <div className="flex items-center justify-between border-b border-slate-150 pb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-6 w-6 text-indigo-600" />
                  <h2 className="text-lg font-heading font-black text-slate-900">
                    {calendarDate.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { month: 'long', year: 'numeric' })}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                    aria-label={t("Previous month", "Predchádzajúci mesiac", "Előző hónap")}
                    title={t("Previous month", "Predchádzajúci mesiac", "Előző hónap")}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date())}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-extrabold cursor-pointer transition-all"
                  >
                    {t("Today", "Dnes", "Ma")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                    aria-label={t("Next month", "Nasledujúci mesiac", "Következő hónap")}
                    title={t("Next month", "Nasledujúci mesiac", "Következő hónap")}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Day Name Headers + grid share one horizontal scroller so the
                  column labels cannot drift out of step with the cells. */}
              <div className="overflow-x-auto -mx-2 px-2">
              <div className="min-w-[560px] grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div className="min-w-[560px] grid grid-cols-7 gap-2 mt-2">
                {calendarDays.map((day, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (day.posts.length > 0) {
                        const displayDateStr = new Date(day.dateStr).toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        setSelectedCalendarDay({ dateStr: day.dateStr, displayDate: displayDateStr, posts: day.posts });
                      }
                    }}
                    className={`min-h-[110px] p-2.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      day.posts.length > 0 
                        ? "cursor-pointer hover:border-rose-400 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" 
                        : ""
                    } ${
                      day.isCurrentMonth
                        ? "bg-white border-slate-200/80 shadow-sm"
                        : "bg-slate-50/50 border-slate-150 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black ${day.isCurrentMonth ? "text-slate-800" : "text-slate-400"}`}>
                        {day.dayNum}
                      </span>
                      {day.posts.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      )}
                    </div>

                    {/* Day Posts List Badges */}
                    <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                      {day.posts.slice(0, 2).map(p => {
                        const platMeta = getPlatformMeta(p.platform);
                        return (
                          <div
                            key={p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const displayDateStr = new Date(day.dateStr).toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                              setSelectedCalendarDay({ dateStr: day.dateStr, displayDate: displayDateStr, posts: day.posts });
                            }}
                            className={`p-1.5 rounded-xl text-[9.5px] font-bold truncate cursor-pointer transition-all ${platMeta.bg} ${platMeta.text} hover:opacity-90 shadow-sm`}
                            title={p.content}
                          >
                            <span className="truncate block">{p.content}</span>
                          </div>
                        );
                      })}
                      {day.posts.length > 2 && (
                        <span className="text-[9px] font-extrabold text-slate-400 block text-center">
                          +{day.posts.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW 3: ANALYTICS VIEW (KPIs, Heatmap, Ranking & Charts)     */}
          {/* ============================================================ */}
          {activeView === "analytics" && (
            <div className="space-y-6 animate-fade-in select-none">
              
              {/* TOP HEADER CONTROLS: SUB-TABS & GLOBAL FILTERS */}
              <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                
                {/* Posting Analytics vs Inbox Analytics Sub-Tabs */}
                <div className="flex items-center bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/90 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab("posting")}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      analyticsSubTab === "posting"
                        ? "bg-slate-900 text-white shadow-md"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t("Posting Analytics", "Analytika publikovania", "Közzétételi analitika")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab("inbox")}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      analyticsSubTab === "inbox"
                        ? "bg-slate-900 text-white shadow-md"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t("Inbox Analytics", "Analytika doručenej pošty", "Bejövő üzenetek analitika")}
                  </button>
                </div>

                {/* Global Filters: Platform, Date Range, Export */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Platform Filter Dropdown */}
                  <div className="relative">
                    <CustomSelect
                      value={analyticsPlatformFilter}
                      onChange={(v) => setAnalyticsPlatformFilter(v)}
                      icon={<Filter className="h-3.5 w-3.5 text-slate-400" />}
                      options={[
                        { value: "all", label: t("All Platforms", "Všetky platformy", "Minden platform") },
                        ...activePlatformKeys.map((k) => ({ value: k, label: getPlatformMeta(k).name })),
                      ]}
                    />
                  </div>

                  {/* Date Range Selector */}
                  <div className="relative">
                    <CustomSelect
                      value={analyticsDateRange}
                      onChange={(v) => setAnalyticsDateRange(v)}
                      icon={<Calendar className="h-3.5 w-3.5 text-slate-400" />}
                      options={[
                        { value: "7d", label: t("Last 7 days", "Posledných 7 dní", "Elmúlt 7 nap") },
                        { value: "30d", label: t("Last 30 days", "Posledných 30 dní", "Elmúlt 30 nap") },
                        { value: "90d", label: t("Last 90 days", "Posledných 90 dní", "Elmúlt 90 nap") },
                      ]}
                    />
                  </div>

                  {/* Export Report Action */}
                  <button
                    type="button"
                    onClick={() => {
                      if (analyticsPosts.length === 0) {
                        (window as any).showToast?.(t("Nothing to export in this period.", "V tomto období nie je čo exportovať.", "Ebben az időszakban nincs mit exportálni."), "warning");
                        return;
                      }
                      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
                      const header = ["Platform", "Account", "Status", "Date", "Content", "Likes", "Comments", "Shares", "Clicks", "Impressions", "URL"];
                      const rows = analyticsPosts.map(post => [
                        getPlatformMeta(post.platform).name,
                        post.accountHandle || post.accountName,
                        post.status,
                        post.publishedAt || post.scheduledFor || "",
                        post.content,
                        post.stats.likes,
                        post.stats.comments,
                        post.stats.shares,
                        post.stats.clicks,
                        post.stats.impressions,
                        post.platformPostUrl || ""
                      ]);
                      // BOM so Excel opens the UTF-8 accents correctly.
                      const csv = "\uFEFF" + [header, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
                      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `social-analytics-${analyticsDateRange}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      (window as any).showToast?.(t("Analytics exported as CSV.", "Analytika bola exportovaná do CSV.", "Az analitika CSV-be exportálva."));
                    }}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-rose-200 cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("Export", "Exportovať", "Exportálás")}
                  </button>
                </div>
              </div>

              {analyticsSubTab === "posting" ? (
                <>
                  {/* SUMMARY KPI CARDS — every figure is reduced from the posts
                      currently in scope. The previous version shipped fixed trend
                      chips ("-2.5% vs prev"), a 1,420-follower count and a Reach
                      figure derived by multiplying impressions by 0.6; none of
                      those had a data source, so they are gone rather than faked. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Engagement Rate", "Miera angažovanosti", "Kötődési arány")}
                      </span>
                      <div className="text-2xl font-black text-rose-600 font-mono">
                        {analyticsKpis.avgRate}%
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        {t("Interactions per impression", "Interakcie na zobrazenie", "Interakció / megjelenés")}
                      </span>
                    </div>

                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Total Impressions", "Zobrazenia spolu", "Összes megjelenés")}
                      </span>
                      <div className="text-2xl font-black text-indigo-600 font-mono">
                        {analyticsKpis.totalImpressions.toLocaleString()}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        {t("Reported by the platforms", "Podľa údajov platforiem", "A platformok adatai alapján")}
                      </span>
                    </div>

                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Total Interactions", "Interakcie spolu", "Összes interakció")}
                      </span>
                      <div className="text-2xl font-black text-emerald-600 font-mono">
                        {analyticsKpis.totalEngagement.toLocaleString()}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        {analyticsKpis.totalLikes.toLocaleString()} {t("likes", "lajkov", "lájk")} · {analyticsKpis.totalComments.toLocaleString()} {t("comments", "komentárov", "komment")} · {analyticsKpis.totalShares.toLocaleString()} {t("shares", "zdieľaní", "megosztás")}
                      </span>
                    </div>

                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Posts in Period", "Príspevky za obdobie", "Bejegyzések az időszakban")}
                      </span>
                      <div className="text-2xl font-black text-slate-900 font-mono">
                        {analyticsKpis.postCount}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        {analyticsKpis.publishedCount} {t("published", "publikovaných", "közzétéve")} · {analyticsKpis.scheduledCount} {t("scheduled", "naplánovaných", "ütemezve")}
                      </span>
                    </div>
                  </div>

                  {/* BEST POST — ranked, not "whatever came first in the array" */}
                  {rankedPosts[0] && (
                    <div
                      onClick={() => handleOpenPostDetails(rankedPosts[0])}
                      className="glass-panel p-5 rounded-3xl border border-amber-200/80 bg-amber-50/70 shadow-glass space-y-2 cursor-pointer hover:bg-amber-100/70 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-black text-amber-700 uppercase tracking-widest block">
                          ⭐ {t("Best performing post", "Najlepší príspevok", "Legjobban teljesítő bejegyzés")}
                        </span>
                        <Award className="h-4 w-4 text-amber-500" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 break-words line-clamp-2">
                        {rankedPosts[0].content || t("(no text)", "(bez textu)", "(nincs szöveg)")}
                      </p>
                      <span className="text-[10px] font-mono text-amber-800 font-bold block">
                        {getPlatformMeta(rankedPosts[0].platform).name} · {rankedPosts[0].stats.likes} {t("likes", "lajkov", "lájk")} · {rankedPosts[0].stats.impressions.toLocaleString()} {t("impressions", "zobrazení", "megjelenés")}
                      </span>
                    </div>
                  )}

                  {/* DISTRIBUTION CHARTS — all four series are computed from the
                      posts in scope. They used to be literal Jul 21-27 arrays. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Chart 1: Posts per Platform */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3 gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Posts per Platform", "Príspevky podľa platforiem", "Bejegyzések platformonként")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {t("Distribution across connected networks", "Rozloženie podľa pripojených sietí", "Megoszlás a csatlakoztatott hálózatok között")}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl shrink-0">
                          {analyticsPosts.length}
                        </span>
                      </div>

                      <div className="space-y-3 pt-2">
                        {analyticsPlatformKeys.length === 0 ? (
                          <p className="text-xs text-slate-400 font-semibold py-6 text-center">
                            {t("No data in this period.", "V tomto období nie sú dáta.", "Ebben az időszakban nincs adat.")}
                          </p>
                        ) : analyticsPlatformKeys.map((platKey) => {
                          const platData = getPlatformMeta(platKey);
                          const count = analyticsPosts.filter(p => p.platform === platKey).length;
                          const pct = analyticsPosts.length > 0 ? (count / analyticsPosts.length) * 100 : 0;
                          return (
                            <div key={platKey} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 gap-2">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${platData.bg}`}></span>
                                  <span className="truncate">{platData.name}</span>
                                </span>
                                <span className="font-mono shrink-0">{count} ({pct.toFixed(0)}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div className={`h-full ${platData.bg} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Chart 2: Posts over Time */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3 gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Posts over Time", "Príspevky v čase", "Bejegyzések az időben")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {t("Publishing cadence", "Frekvencia publikovania", "Közzétételi ütem")}
                          </span>
                        </div>
                        <Activity className="h-4 w-4 text-rose-500 shrink-0" />
                      </div>

                      <div className="h-48 flex items-end justify-between gap-1 pt-6 pb-2 overflow-x-auto">
                        {(() => {
                          const max = Math.max(...analyticsDailySeries.map(b => b.posts), 1);
                          return analyticsDailySeries.map((b, idx) => (
                            <div key={idx} className="flex-1 min-w-[14px] flex flex-col items-center gap-2 group" title={`${b.label}: ${b.posts}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                {b.posts}
                              </span>
                              <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-32">
                                <div
                                  className="w-full bg-gradient-to-t from-rose-500 to-amber-500 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                                  style={{ height: `${(b.posts / max) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase truncate w-full text-center">
                                {idx % labelEvery === 0 ? b.label : ""}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Chart 3: Likes per Platform */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3 gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Likes per Platform", "Lajky podľa platforiem", "Lájkok platformonként")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {t("Reactions gathered per network", "Reakcie podľa siete", "Reakciók hálózatonként")}
                          </span>
                        </div>
                        <Heart className="h-4 w-4 text-rose-500 fill-rose-500 shrink-0" />
                      </div>

                      <div className="space-y-3 pt-2">
                        {analyticsPlatformKeys.length === 0 ? (
                          <p className="text-xs text-slate-400 font-semibold py-6 text-center">
                            {t("No data in this period.", "V tomto období nie sú dáta.", "Ebben az időszakban nincs adat.")}
                          </p>
                        ) : (() => {
                          const totals = analyticsPlatformKeys.map(k => ({
                            key: k,
                            likes: analyticsPosts.filter(p => p.platform === k).reduce((acc, p) => acc + (p.stats.likes || 0), 0)
                          }));
                          const maxLikes = Math.max(...totals.map(x => x.likes), 1);
                          return totals.map(({ key, likes }) => {
                            const platData = getPlatformMeta(key);
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 gap-2">
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${platData.bg}`}></span>
                                    <span className="truncate">{platData.name}</span>
                                  </span>
                                  <span className="font-mono shrink-0">{likes.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                  <div className={`h-full ${platData.bg} transition-all duration-500`} style={{ width: `${(likes / maxLikes) * 100}%` }}></div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Chart 4: Interactions over Time */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3 gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Interactions over Time", "Interakcie v čase", "Interakciók az időben")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {t("Likes, comments and shares combined", "Lajky, komentáre a zdieľania spolu", "Lájkok, kommentek és megosztások")}
                          </span>
                        </div>
                        <TrendingUp className="h-4 w-4 text-indigo-500 shrink-0" />
                      </div>

                      <div className="h-48 flex items-end justify-between gap-1 pt-6 pb-2 overflow-x-auto">
                        {(() => {
                          const vals = analyticsDailySeries.map(b => b.likes + b.comments + b.shares);
                          const max = Math.max(...vals, 1);
                          return analyticsDailySeries.map((b, idx) => (
                            <div key={idx} className="flex-1 min-w-[14px] flex flex-col items-center gap-2 group" title={`${b.label}: ${vals[idx]}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                {vals[idx]}
                              </span>
                              <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-32">
                                <div
                                  className="w-full bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                                  style={{ height: `${(vals[idx] / max) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase truncate w-full text-center">
                                {idx % labelEvery === 0 ? b.label : ""}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                  </div>

                  {/* ENGAGEMENT OVER TIME — the line paths are generated from the
                      same buckets. Previously three fixed bezier curves, where the
                      comments/reach/clicks pills toggled nothing at all. */}
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-150 pb-4">
                      <div>
                        <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="h-4.5 w-4.5 text-rose-500" />
                          {t("Engagement Over Time", "Engažovanosť v čase", "Kötődés az időben")}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("Toggle a metric to add or remove its curve.", "Prepnutím metriky pridáte alebo odoberiete krivku.", "Kapcsolja be a mutatót a görbe megjelenítéséhez.")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {METRIC_SERIES.map((m) => {
                          const isActive = activeMetrics.includes(m.id);
                          const total = analyticsDailySeries.reduce((acc, b) => acc + ((b as any)[m.id] as number), 0);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setActiveMetrics(prev =>
                                  prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]
                                );
                              }}
                              className={`px-3 py-1 rounded-xl text-[10.5px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                                isActive ? m.pill : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {isActive && <Check className="h-3 w-3" />}
                              {t(m.en, m.sk, m.hu)} ({total.toLocaleString()})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="relative h-64 w-full pt-4">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                        <line x1="0" y1="40" x2="700" y2="40" stroke="#f1f5f9" strokeDasharray="4 4" />
                        <line x1="0" y1="90" x2="700" y2="90" stroke="#f1f5f9" strokeDasharray="4 4" />
                        <line x1="0" y1="140" x2="700" y2="140" stroke="#f1f5f9" strokeDasharray="4 4" />

                        {METRIC_SERIES.filter(m => activeMetrics.includes(m.id)).map(m => {
                          const vals = analyticsDailySeries.map(b => (b as any)[m.id] as number);
                          const max = Math.max(...vals, 1);
                          const step = vals.length > 1 ? 700 / (vals.length - 1) : 0;
                          const points = vals
                            .map((v, i) => `${(i * step).toFixed(1)},${(190 - (v / max) * 170).toFixed(1)}`)
                            .join(" ");
                          return (
                            <polyline
                              key={m.id}
                              points={points || "0,190"}
                              fill="none"
                              stroke={m.stroke}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          );
                        })}
                      </svg>

                      <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                        <span>{analyticsDailySeries[0]?.label}</span>
                        <span>{analyticsDailySeries[analyticsDailySeries.length - 1]?.label}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      {t(
                        "Each curve is scaled to its own maximum so metrics of different magnitude stay comparable.",
                        "Každá krivka je škálovaná na vlastné maximum, aby boli metriky rôznych rádov porovnateľné.",
                        "Minden görbe a saját maximumára van skálázva."
                      )}
                    </p>
                  </div>

                  {/* BEST TIME TO POST — built from this workspace's own publish
                      times. It used to shade cells with (dayIndex + hourIndex) % 3. */}
                  <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-150 pb-3 gap-3">
                      <div className="min-w-0">
                        <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Clock className="h-4 w-4 text-emerald-500" />
                          {t("Best Time to Post", "Najlepší čas na publikovanie", "Legjobb közzétételi idő")}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {t("Interactions collected per weekday and 2-hour block", "Interakcie podľa dňa v týždni a 2-hodinových blokov", "Interakciók hétköznap és 2 órás blokk szerint")}
                        </span>
                      </div>
                      {postingHeatmap.bestLabel && (
                        <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl shrink-0">
                          {postingHeatmap.bestLabel}
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[420px] space-y-1.5 pt-2">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, dIdx) => (
                          <div key={day} className="flex items-center gap-2">
                            <span className="w-8 text-[10px] font-black text-slate-400 uppercase shrink-0">{day}</span>
                            <div className="flex-1 grid grid-cols-12 gap-1">
                              {postingHeatmap.grid[dIdx].map((cell, hIdx) => {
                                const intensity = postingHeatmap.max > 0 ? cell.engagement / postingHeatmap.max : 0;
                                const cls = cell.posts === 0
                                  ? "bg-slate-100"
                                  : intensity > 0.66
                                  ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                                  : intensity > 0.33
                                  ? "bg-emerald-300"
                                  : "bg-emerald-100";
                                return (
                                  <div
                                    key={hIdx}
                                    title={`${day} ${String(hIdx * 2).padStart(2, "0")}:00 - ${cell.posts} / ${cell.engagement}`}
                                    className={`h-5 rounded-lg transition-all hover:scale-110 ${cls}`}
                                  ></div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-150 gap-3">
                      <span className="truncate">
                        {postingHeatmap.max === 0
                          ? t("No published posts in this period yet.", "V tomto období zatiaľ nie sú publikované príspevky.", "Ebben az időszakban még nincs közzétett bejegyzés.")
                          : t("00:00 to 24:00 in 2-hour blocks", "00:00 až 24:00 v 2-hodinových blokoch", "00:00 - 24:00 két órás blokkokban")}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span>{t("Less", "Menej", "Kevesebb")}</span>
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-100"></span>
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100"></span>
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300"></span>
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                        <span>{t("More", "Viac", "Több")}</span>
                      </div>
                    </div>
                  </div>

                  {/* TABULAR BREAKDOWN 1: PLATFORM BREAKDOWN TABLE */}
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4 overflow-x-auto">
                    <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                      <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Globe className="h-4.5 w-4.5 text-rose-500" />
                        {t("Platform Breakdown Table", "Tabuľka podľa platforiem", "Platform bontási táblázat")}
                      </h3>
                      <span className="text-[10.5px] font-mono font-bold text-slate-500">
                        {analyticsPlatformKeys.length} {t("channels with activity", "sietí s aktivitou", "aktív csatorna")}
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="py-2.5 px-3">Platform</th>
                          <th className="py-2.5 px-3 text-center">Posts</th>
                          <th className="py-2.5 px-3 text-center">Likes</th>
                          <th className="py-2.5 px-3 text-center">Comments</th>
                          <th className="py-2.5 px-3 text-center">Shares</th>
                          <th className="py-2.5 px-3 text-center">Clicks</th>
                          <th className="py-2.5 px-3 text-center">Impressions</th>
                          <th className="py-2.5 px-3 text-right">ER %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-xs font-semibold text-slate-800">
                        {analyticsPlatformKeys.map((platKey) => {
                          const platData = getPlatformMeta(platKey);
                          const platPosts = analyticsPosts.filter(p => p.platform === platKey);
                          const likes = platPosts.reduce((acc, p) => acc + p.stats.likes, 0);
                          const comments = platPosts.reduce((acc, p) => acc + p.stats.comments, 0);
                          const shares = platPosts.reduce((acc, p) => acc + p.stats.shares, 0);
                          const clicks = platPosts.reduce((acc, p) => acc + p.stats.clicks, 0);
                          const impressions = platPosts.reduce((acc, p) => acc + p.stats.impressions, 0);
                          // Computed from what the platforms actually reported rather
                          // than averaging a per-post rate that is 0 until insights land.
                          const er = impressions > 0 ? (((likes + comments + shares) / impressions) * 100).toFixed(1) : "0.0";

                          return (
                            <tr key={platKey} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3">
                                <span className="flex items-center gap-2 font-black text-slate-900">
                                  <span className={`w-2.5 h-2.5 rounded-full ${platData.bg}`}></span>
                                  {platData.name}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-mono">{platPosts.length}</td>
                              <td className="py-3 px-3 text-center font-mono text-rose-600 font-bold">{likes}</td>
                              <td className="py-3 px-3 text-center font-mono text-blue-600">{comments}</td>
                              <td className="py-3 px-3 text-center font-mono text-emerald-600">{shares}</td>
                              <td className="py-3 px-3 text-center font-mono text-amber-600">{clicks}</td>
                              <td className="py-3 px-3 text-center font-mono text-indigo-600 font-bold">{impressions.toLocaleString()}</td>
                              <td className="py-3 px-3 text-right font-mono">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {er}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* TABULAR BREAKDOWN 2: TOP PERFORMING POSTS RANKING TABLE */}
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4 overflow-x-auto">
                    <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                      <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Award className="h-4.5 w-4.5 text-amber-500" />
                        {t("Top Performing Posts Ranking", "Rebríček najlepších príspevkov", "Legjobban teljesítő bejegyzések rangsora")}
                      </h3>
                      <span className="text-[10.5px] font-mono font-bold text-slate-500">
                        {t("Sorted by highest engagement rate", "Zoradené podľa najvyššej angažovanosti", "A legmagasabb kötődési arány szerint rendezve")}
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="py-2.5 px-3">Post Content</th>
                          <th className="py-2.5 px-3 text-center">Likes</th>
                          <th className="py-2.5 px-3 text-center">Comments</th>
                          <th className="py-2.5 px-3 text-center">Shares</th>
                          <th className="py-2.5 px-3 text-center">Clicks</th>
                          <th className="py-2.5 px-3 text-center">Impressions</th>
                          <th className="py-2.5 px-3 text-right">ER %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-xs font-semibold text-slate-800">
                        {rankedPosts.map((post, idx) => {
                          const platData = getPlatformMeta(post.platform);
                          return (
                            <tr
                              key={post.id}
                              onClick={() => handleOpenPostDetails(post)}
                              className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-3 max-w-xs">
                                <div className="flex items-center gap-3">
                                  <span className={`w-7 h-7 rounded-xl ${platData.bg} text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs`}>
                                    #{idx + 1}
                                  </span>
                                  <div className="truncate">
                                    <span className="font-extrabold text-slate-900 block truncate group-hover:text-rose-600 transition-colors">
                                      {post.content}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {platData.name} • {post.accountHandle}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-rose-600 font-bold">{post.stats.likes}</td>
                              <td className="py-3 px-3 text-center font-mono text-blue-600">{post.stats.comments}</td>
                              <td className="py-3 px-3 text-center font-mono text-emerald-600">{post.stats.shares}</td>
                              <td className="py-3 px-3 text-center font-mono text-amber-600">{post.stats.clicks}</td>
                              <td className="py-3 px-3 text-center font-mono text-indigo-600 font-bold">{post.stats.impressions.toLocaleString()}</td>
                              <td className="py-3 px-3 text-right font-mono">
                                <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
                                  {post.stats.engagementRate}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </>
              ) : (
                /* INBOX ANALYTICS SUB-TAB — response time, sentiment and ticket
                   counts need Zernio's inbox endpoints, which this integration does
                   not read yet. It previously showed 12.4 min / 94% / 148 tickets
                   as if they were measured. */
                <div className="glass-panel p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider">
                      {t("Inbox Analytics", "Analytika doručenej pošty", "Bejövő üzenetek analitikája")}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        "Response times, sentiment and resolution rates are not part of this integration yet. Comments on individual posts are available in the post detail.",
                        "Časy odozvy, sentiment a miera vyriešenia zatiaľ nie sú súčasťou tejto integrácie. Komentáre k jednotlivým príspevkom nájdete v detaile príspevku.",
                        "A válaszidők, a hangulat és a megoldási arány még nem része ennek az integrációnak. Az egyes bejegyzések kommentjei a bejegyzés részleteinél érhetők el."
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )}

      {/* Right Slideout Drawer for Calendar Day Feed */}
      {selectedCalendarDay && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedCalendarDay(null)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100000] animate-fade-in"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-slate-100 shadow-2xl z-[100001] border-l border-slate-200 flex flex-col justify-between animate-in slide-in-from-right duration-300 select-none">
            {/* Drawer Header */}
            <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-rose-500" />
                  <h2 className="text-base font-heading font-black text-slate-900 capitalize">
                    {selectedCalendarDay.displayDate}
                  </h2>
                </div>
                <span className="text-xs font-extrabold text-slate-500 mt-1 block">
                  {selectedCalendarDay.posts.length} {t("Social Media Posts", "Príspevkov na sociálnych sieťach", "Bejegyzés a közösségi médiában")}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCalendarDay(null)}
                aria-label={t("Close", "Zavrieť", "Bezárás")}
                title={t("Close", "Zavrieť", "Bezárás")}
                className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body: Authentic Stylized Feed */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {selectedCalendarDay.posts.map(post => {
                const rawDate = post.publishedAt || post.scheduledFor || new Date().toISOString();
                const formattedTime = new Date(rawDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const platMeta = getPlatformMeta(post.platform);

                // 1. TWITTER / X
                if (post.platform === "twitter") {
                  return (
                    <div
                      key={post.id}
                      onClick={() => { setSelectedCalendarDay(null); handleOpenPostDetails(post); }}
                      className="bg-slate-950 text-white rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3.5 font-sans cursor-pointer hover:ring-2 hover:ring-sky-400/60 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-extrabold flex items-center justify-center text-sm border border-slate-700 shrink-0">
                            𝕏
                          </div>
                          <div>
                            <div className="flex items-center gap-1 font-bold text-sm text-white min-w-0">
                              <span className="truncate">{post.accountName}</span>
                              <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 fill-sky-400" />
                            </div>
                            <span className="text-xs text-slate-400 truncate block">{post.accountHandle} • {formattedTime}</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          {post.status}
                        </span>
                      </div>

                      <p className="text-xs font-normal text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                        {post.content}
                      </p>

                      {post.mediaUrls && post.mediaUrls.length > 0 && (
                        <div className="rounded-2xl overflow-hidden max-h-56 border border-slate-800">
                          <img src={post.mediaUrls[0]} alt="Media" referrerPolicy="no-referrer" className="w-full h-44 object-cover" />
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-400 text-xs font-mono">
                        <span className="flex items-center gap-1 hover:text-sky-400"><MessageSquare className="h-3.5 w-3.5" /> {post.stats.comments}</span>
                        <span className="flex items-center gap-1 hover:text-emerald-400"><Repeat className="h-3.5 w-3.5" /> {post.stats.shares}</span>
                        <span className="flex items-center gap-1 hover:text-rose-500"><Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" /> {post.stats.likes}</span>
                        <span className="flex items-center gap-1 hover:text-sky-400"><Eye className="h-3.5 w-3.5" /> {post.stats.impressions}</span>
                        <Bookmark className="h-3.5 w-3.5 hover:text-sky-400" />
                      </div>
                    </div>
                  );
                }

                // 2. INSTAGRAM
                if (post.platform === "instagram") {
                  return (
                    <div
                      key={post.id}
                      onClick={() => { setSelectedCalendarDay(null); handleOpenPostDetails(post); }}
                      className="bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-md overflow-hidden font-sans space-y-3 pb-4 cursor-pointer hover:ring-2 hover:ring-rose-400/60 transition-all"
                    >
                      <div className="p-4 pb-0 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-0.5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
                            <div className="w-8 h-8 rounded-full bg-white p-0.5 flex items-center justify-center font-bold text-xs">
                              📸
                            </div>
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-900 block">{post.accountHandle}</span>
                            <span className="text-[10px] text-slate-400 block">{formattedTime}</span>
                          </div>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-slate-400" />
                      </div>

                      {post.mediaUrls && post.mediaUrls.length > 0 ? (
                        <img src={post.mediaUrls[0]} alt="Instagram photo" referrerPolicy="no-referrer" className="w-full h-52 object-cover" />
                      ) : (
                        <div className="w-full h-36 bg-gradient-to-tr from-purple-600 to-rose-500 flex items-center justify-center text-white font-extrabold text-xs p-4 text-center">
                          "{post.content}"
                        </div>
                      )}

                      <div className="px-4 space-y-2">
                        <div className="flex items-center justify-between text-slate-700">
                          <div className="flex items-center gap-3">
                            <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                            <MessageSquare className="h-4 w-4 hover:text-slate-900" />
                            <Send className="h-4 w-4 hover:text-slate-900" />
                          </div>
                          <Bookmark className="h-4 w-4 hover:text-slate-900" />
                        </div>

                        <div className="text-[11px] font-extrabold text-slate-900">
                          {post.stats.likes.toLocaleString()} {t("likes", "lajkov", "lájk")}
                        </div>

                        <p className="text-xs text-slate-800 leading-snug break-words">
                          <strong className="font-black text-slate-900 mr-1.5">{post.accountHandle}</strong>
                          {post.content}
                        </p>
                      </div>
                    </div>
                  );
                }

                // 3. LINKEDIN
                if (post.platform === "linkedin") {
                  return (
                    <div
                      key={post.id}
                      onClick={() => { setSelectedCalendarDay(null); handleOpenPostDetails(post); }}
                      className="bg-white text-slate-900 rounded-3xl p-4.5 border border-slate-200 shadow-md font-sans space-y-3 cursor-pointer hover:ring-2 hover:ring-blue-500/60 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-700 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0">
                            in
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-900 block truncate">{post.accountName}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{post.accountHandle || getPlatformMeta(post.platform).name} • {formattedTime}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                          {post.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap break-words">
                        {post.content}
                      </p>

                      {post.mediaUrls && post.mediaUrls.length > 0 && (
                        <div className="rounded-2xl overflow-hidden max-h-48 border border-slate-200">
                          <img src={post.mediaUrls[0]} alt="LinkedIn attachment" referrerPolicy="no-referrer" className="w-full h-40 object-cover" />
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-150 flex items-center justify-between text-[11px] font-bold text-slate-500">
                        <span className="flex items-center gap-1 text-blue-600">
                          👍 ❤️ 💡 {post.stats.likes} reactions
                        </span>
                        <span>{post.stats.comments} comments</span>
                      </div>

                    </div>
                  );
                }

                // 4. DEFAULT / OTHER PLATFORMS (TikTok, YouTube, Facebook, Threads, Bluesky)
                return (
                  <div
                    key={post.id}
                    onClick={() => { setSelectedCalendarDay(null); handleOpenPostDetails(post); }}
                    className="bg-white text-slate-900 rounded-3xl p-5 border border-slate-200 shadow-md font-sans space-y-3.5 cursor-pointer hover:ring-2 hover:ring-rose-400/60 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${platMeta.bg} ${platMeta.text} shadow-sm`}>
                          {platMeta.name}
                        </span>
                        <div>
                          <span className="text-xs font-black text-slate-900 block">{post.accountHandle}</span>
                          <span className="text-[10px] text-slate-400 block">{formattedTime}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        post.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                      }`}>
                        {post.status}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                      {post.content}
                    </p>

                    {post.mediaUrls && post.mediaUrls.length > 0 && (
                      <div className="rounded-2xl overflow-hidden max-h-48 border border-slate-200">
                        <img src={post.mediaUrls[0]} alt="Media attachment" referrerPolicy="no-referrer" className="w-full h-40 object-cover" />
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-150 grid grid-cols-4 gap-1 text-center bg-slate-50 p-2 rounded-2xl border border-slate-150">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Likes</span>
                        <span className="text-xs font-black text-slate-800">{post.stats.likes}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Comments</span>
                        <span className="text-xs font-black text-slate-800">{post.stats.comments}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Shares</span>
                        <span className="text-xs font-black text-slate-800">{post.stats.shares}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Views</span>
                        <span className="text-xs font-black text-slate-800">{post.stats.impressions}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 text-center">
              <button
                type="button"
                onClick={() => setSelectedCalendarDay(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                {t("Close Feed", "Zavrieť zoznam", "Bezárás")}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
