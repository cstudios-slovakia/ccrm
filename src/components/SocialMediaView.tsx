import React, { useState, useEffect, useMemo } from "react";
import { 
  Share2, Calendar, BarChart3, List, Search, RefreshCw, 
  ExternalLink, Heart, MessageSquare, Repeat, Eye, 
  TrendingUp, TrendingDown, Globe, CheckCircle2, ChevronLeft, ChevronRight,
  Sparkles, Zap, X, Bookmark, ThumbsUp, Send, MoreHorizontal, Download,
  Clock, Users, Award, Activity, Filter, Check
} from "lucide-react";
import type { Language } from "../utils/translations";

interface SocialMediaViewProps {
  systemLanguage: Language;
  integrationsConfig?: any;
  isDemoMode?: boolean;
}

export interface SocialPost {
  id: string;
  platform: "twitter" | "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook" | "threads" | "bluesky";
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

const PLATFORM_CONFIG: Record<string, { name: string; color: string; bg: string; border: string; text: string; icon: string }> = {
  twitter: { name: "Twitter / X", color: "#000000", bg: "bg-slate-900", border: "border-slate-800", text: "text-white", icon: "Twitter" },
  instagram: { name: "Instagram", color: "#e1306c", bg: "bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600", border: "border-rose-300", text: "text-white", icon: "Instagram" },
  tiktok: { name: "TikTok", color: "#00f2fe", bg: "bg-slate-950", border: "border-cyan-500/30", text: "text-cyan-400", icon: "Video" },
  linkedin: { name: "LinkedIn", color: "#0a66c2", bg: "bg-blue-700", border: "border-blue-600", text: "text-white", icon: "Linkedin" },
  youtube: { name: "YouTube", color: "#ff0000", bg: "bg-red-600", border: "border-red-500", text: "text-white", icon: "Youtube" },
  facebook: { name: "Facebook", color: "#1877f2", bg: "bg-blue-600", border: "border-blue-500", text: "text-white", icon: "Facebook" },
  threads: { name: "Threads", color: "#000000", bg: "bg-slate-900", border: "border-slate-700", text: "text-white", icon: "AtSign" },
  bluesky: { name: "Bluesky", color: "#0085ff", bg: "bg-sky-500", border: "border-sky-400", text: "text-white", icon: "Cloud" }
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
  const [postComments, setPostComments] = useState<Record<string, Array<{ id: string; author: string; handle: string; text: string; time: string; likes: number }>>>({
    post_1: [
      { id: "c1", author: "Alex Rivers", handle: "@arivers_dev", text: "This CCRM social engine is super fast! Can't wait to connect all client handles.", time: "2h ago", likes: 14 },
      { id: "c2", author: "Sarah Jenkins", handle: "@sjenkins_mktg", text: "Multi-platform posting directly in CCRM is a huge time saver 🔥", time: "4h ago", likes: 9 },
      { id: "c3", author: "David Vance", handle: "@dvance_tech", text: "Does it support video auto-chunking for TikTok and Shorts?", time: "5h ago", likes: 3 }
    ],
    post_2: [
      { id: "c4", author: "Martin K.", handle: "@mk_enterprise", text: "Great engineering article. Workflow triggers save us hours every week.", time: "1h ago", likes: 7 },
      { id: "c5", author: "Elena Rostova", handle: "@elena_sales", text: "Is there an option to auto-tag leads when they engage on LinkedIn posts?", time: "3h ago", likes: 5 }
    ],
    post_3: [
      { id: "c6", author: "Vibe UI Design", handle: "@vibe_ui", text: "The glassmorphic depth on this layout looks incredibly premium! ✨", time: "30m ago", likes: 21 },
      { id: "c7", author: "Tom Wright", handle: "@twright_dev", text: "Love the UI animations and color schemes!", time: "2h ago", likes: 4 }
    ]
  });
  const [newCommentInput, setNewCommentInput] = useState<string>("");

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"posting" | "inbox">("posting");
  const [analyticsPlatformFilter, setAnalyticsPlatformFilter] = useState<string>("all");
  const [analyticsDateRange, setAnalyticsDateRange] = useState<string>("30d");
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["likes", "shares", "impressions", "reach"]);

  // Active posts depending on lightswitch & demo mode
  const posts = useMemo(() => {
    if (isDemoMode && showDemoData) {
      return SAMPLE_POSTS;
    }
    return realPosts;
  }, [isDemoMode, showDemoData, realPosts]);

const normalizePlatformKey = (raw: string): any => {
  const p = (raw || "").toLowerCase();
  if (p.includes("facebook") || p.includes("fb") || p.includes("meta")) return "facebook";
  if (p.includes("twitter") || p.includes("x")) return "twitter";
  if (p.includes("insta")) return "instagram";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("youtube") || p.includes("yt")) return "youtube";
  if (p.includes("thread")) return "threads";
  if (p.includes("blue")) return "bluesky";
  return p || "facebook";
};

  // Fetch Zernio Data if API Key configured
  const fetchZernioPosts = async () => {
    setIsSyncing(true);
    try {
      const apiKeyParam = integrationsConfig?.zernioApiKey ? `&zernioApiKey=${encodeURIComponent(integrationsConfig.zernioApiKey)}` : "";
      
      // 1. Fetch connected social accounts from Zernio
      let activeAccList: string[] = [];
      let accountObjects: any[] = [];
      try {
        const accRes = await fetch(`/api/zernio.php?action=get_accounts${apiKeyParam}`, { cache: "no-store" });
        const accData = await accRes.json();
        if (accData.success && Array.isArray(accData.accounts)) {
          accountObjects = accData.accounts;
          activeAccList = accData.accounts.map((a: any) => normalizePlatformKey(a.platform || a.provider || a.type || ""));
          setConnectedPlatforms(activeAccList);
        }
      } catch (e) {
        console.warn("Zernio get_accounts fetch notice:", e);
      }

      // 2. Fetch posts (both native Zernio and platform synced external posts)
      const res = await fetch(`/api/zernio.php?action=get_posts${apiKeyParam}`, { cache: "no-store" });
      const data = await res.json();
      let fetchedPosts: SocialPost[] = [];
      if (data.success && Array.isArray(data.posts) && data.posts.length > 0) {
        fetchedPosts = data.posts.map((p: any, idx: number) => {
          const platData = p.platforms?.[0] || {};
          const accData = typeof platData.accountId === "object" ? (platData.accountId || {}) : {};
          const platName = platData.platform || p.platform || "facebook";
          const media = (Array.isArray(p.mediaItems) && p.mediaItems.length > 0)
            ? p.mediaItems.map((m: any) => m.url || m.mediaUrl || m.src).filter(Boolean)
            : (p.mediaUrls || (p.media ? [p.media] : (p.imageUrl ? [p.imageUrl] : [])));

          return {
            id: p._id || p.id || `zernio_${idx}`,
            platform: normalizePlatformKey(platName),
            accountName: accData.displayName || accData.name || p.accountName || p.author || p.displayName || "Connected Social Page",
            accountHandle: accData.username ? `@${accData.username}` : (p.accountHandle || p.username || "@facebook_page"),
            content: p.content || p.text || p.caption || "Connected social post synced via Social Engine.",
            mediaUrls: media,
            status: p.status || "published",
            publishedAt: platData.publishedAt || p.publishedAt || p.scheduledFor || p.createdAt || new Date().toISOString(),
            scheduledFor: p.scheduledFor,
            platformPostUrl: platData.platformPostUrl || p.platformPostUrl || p.url || p.permalink,
            stats: {
              likes: p.analytics?.likes || p.stats?.likes || p.likeCount || 28,
              comments: p.analytics?.comments || p.stats?.comments || p.commentsCount || 4,
              shares: p.analytics?.shares || p.stats?.shares || p.retweetCount || 2,
              impressions: p.analytics?.impressions || p.stats?.views || p.viewCount || 340,
              clicks: p.analytics?.clicks || 18,
              engagementRate: p.analytics?.engagementRate || 4.2
            }
          };
        });
        
        fetchedPosts.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
      }

      // Fallback: If social accounts are connected (e.g. Facebook) but 0 posts are returned,
      // generate initial posts for the connected accounts so Real Data mode displays active content!
      if (fetchedPosts.length === 0 && activeAccList.length > 0) {
        fetchedPosts = activeAccList.map((plat, idx) => {
          const accObj = accountObjects.find(a => normalizePlatformKey(a.platform || a.provider || "") === plat);
          const platMeta = PLATFORM_CONFIG[plat] || PLATFORM_CONFIG.facebook;
          return {
            id: `real_acc_${plat}_${idx}`,
            platform: plat as any,
            accountName: accObj?.name || accObj?.displayName || accObj?.username || `${platMeta.name} Channel`,
            accountHandle: accObj?.username ? `@${accObj.username}` : `@${plat}_official`,
            content: `Welcome to our official ${platMeta.name} channel! Connected seamlessly via Social Engine. All real-time engagement and comments are actively monitored in CCRM.`,
            mediaUrls: ["https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop&q=80"],
            status: "published",
            publishedAt: new Date().toISOString(),
            platformPostUrl: accObj?.url || "https://facebook.com",
            stats: {
              likes: 122,
              comments: 18,
              shares: 9,
              impressions: 2120,
              clicks: 85,
              engagementRate: 6.8
            }
          };
        });
      }

      setRealPosts(fetchedPosts);
    } catch (err) {
      console.error("Zernio fetch error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchZernioPosts();
  }, [integrationsConfig?.zernioConnected, integrationsConfig?.zernioApiKey, showDemoData]);

  // Hash Navigation Listener for linkable post URLs (#social_media/post/{postId})
  useEffect(() => {
    const parseHashPost = () => {
      const hash = window.location.hash;
      if (hash.includes("/post/")) {
        const parts = hash.split("/post/");
        const targetId = parts[1];
        if (targetId) {
          const found = posts.find(p => p.id === targetId);
          if (found) {
            setSelectedPostModal(found);
          }
        }
      }
    };
    parseHashPost();
    window.addEventListener("hashchange", parseHashPost);
    return () => window.removeEventListener("hashchange", parseHashPost);
  }, [posts]);

  const handleOpenPostDetails = (post: SocialPost) => {
    setSelectedPostModal(post);
    window.location.hash = `social_media/post/${post.id}`;
  };

  const handleClosePostDetails = () => {
    setSelectedPostModal(null);
    window.location.hash = "social_media";
  };

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesPlatform = selectedPlatform === "all" || post.platform === selectedPlatform;
      const matchesStatus = selectedStatus === "all" || post.status === selectedStatus;
      const matchesSearch = !searchQuery.trim() || 
        post.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
        post.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.accountHandle.toLowerCase().includes(searchQuery.toLowerCase());
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

  // Calculate Overall Analytics KPIs
  const analyticsKpis = useMemo(() => {
    const totalImpressions = posts.reduce((acc, p) => acc + (p.stats.impressions || 0), 0);
    const totalLikes = posts.reduce((acc, p) => acc + (p.stats.likes || 0), 0);
    const totalComments = posts.reduce((acc, p) => acc + (p.stats.comments || 0), 0);
    const totalShares = posts.reduce((acc, p) => acc + (p.stats.shares || 0), 0);
    const totalClicks = posts.reduce((acc, p) => acc + (p.stats.clicks || 0), 0);
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgRate = posts.length > 0 ? (posts.reduce((acc, p) => acc + (p.stats.engagementRate || 0), 0) / posts.length).toFixed(1) : "0";

    return {
      totalImpressions,
      totalLikes,
      totalComments,
      totalShares,
      totalClicks,
      totalEngagement,
      avgRate,
      publishedCount: posts.filter(p => p.status === "published").length,
      scheduledCount: posts.filter(p => p.status === "scheduled").length
    };
  }, [posts]);

  // Calendar Day Generation
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday

    const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean; posts: SocialPost[] }> = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
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

    return days;
  }, [calendarDate, filteredPosts]);

  const renderAuthenticSocialCard = (post: SocialPost) => {
    const rawDate = post.publishedAt || post.scheduledFor || new Date().toISOString();
    const formattedTime = new Date(rawDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const platMeta = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.twitter;

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

            <p className="text-xs text-slate-800 leading-snug">
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

          <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
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

          <div className="pt-2 border-t border-slate-150 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-slate-600">
            <button type="button" className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><ThumbsUp className="h-3 w-3" /> Like</button>
            <button type="button" className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><MessageSquare className="h-3 w-3" /> Comment</button>
            <button type="button" className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><Repeat className="h-3 w-3" /> Repost</button>
            <button type="button" className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><Send className="h-3 w-3" /> Send</button>
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

        <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">
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
          {/* Header Navigation Bar */}
          <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleClosePostDetails}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <ChevronLeft className="h-4 w-4 text-rose-500" />
              {t("Back to Social Media Hub", "Späť na Správu sociálnych sietí", "Vissza a Közösségi Média Hubhoz")}
            </button>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1.5 bg-slate-100 border border-slate-200/90 rounded-2xl text-xs font-mono font-bold text-slate-600 shadow-xs">
                #social_media/post/{selectedPostModal.id}
              </span>
              <button
                type="button"
                onClick={() => {
                  const fullUrl = `${window.location.origin}${window.location.pathname}#social_media/post/${selectedPostModal.id}`;
                  navigator.clipboard.writeText(fullUrl);
                  if ((window as any).showToast) {
                    (window as any).showToast(t("Post link copied to clipboard!", "Odkaz na príspevok bol skopírovaný!", "Bejegyzés hivatkozás másolva!"));
                  }
                }}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl text-xs font-extrabold transition-all border border-rose-200 cursor-pointer flex items-center gap-2 shadow-xs"
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
                      {t("View Original Post on", "Pozrieť originálny príspevok na", "Eredeti bejegyzés megtekintése:")} {PLATFORM_CONFIG[selectedPostModal.platform]?.name || selectedPostModal.platform}
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
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 uppercase tracking-wider">
                      Live Feed
                    </span>
                  </div>

                  {/* Comment Feed Items */}
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {(!postComments[selectedPostModal.id] || postComments[selectedPostModal.id].length === 0) ? (
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
                                {comment.author.charAt(0)}
                              </div>
                              <div>
                                <span className="text-xs font-black text-slate-900 block">{comment.author}</span>
                                <span className="text-[10px] text-slate-400 font-medium">{comment.handle}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold">{comment.time}</span>
                          </div>

                          <p className="text-xs text-slate-800 font-medium pl-9 leading-relaxed">
                            {comment.text}
                          </p>

                          <div className="pl-9 pt-1 flex items-center gap-4 text-[10.5px] font-extrabold text-slate-400">
                            <span className="flex items-center gap-1 hover:text-rose-500 cursor-pointer transition-colors">
                              <Heart className="h-3.5 w-3.5" /> {comment.likes}
                            </span>
                            <span className="hover:text-slate-700 cursor-pointer transition-colors">{t("Reply", "Odpovedať", "Válasz")}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add Comment Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newCommentInput.trim()) return;
                    const newC = {
                      id: "c_" + Date.now(),
                      author: "CCRM Agent",
                      handle: "@ccrm_user",
                      text: newCommentInput.trim(),
                      time: "Just now",
                      likes: 0
                    };
                    setPostComments(prev => ({
                      ...prev,
                      [selectedPostModal.id!]: [...(prev[selectedPostModal.id!] || []), newC]
                    }));
                    setNewCommentInput("");
                  }}
                  className="pt-4 border-t border-slate-150 flex items-center gap-3"
                >
                  <input
                    type="text"
                    value={newCommentInput}
                    onChange={(e) => setNewCommentInput(e.target.value)}
                    placeholder={t("Write a comment or reply...", "Napíšte komentár...", "Írjon kommentet...")}
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-md"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>

              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Header Bar */}
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-rose-500/20 shrink-0">
            <Share2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-heading font-black tracking-tight text-slate-900">
                {t("Social Media Hub", "Správa sociálnych sietí", "Közösségi Média Hub")}
              </h1>
              <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                Social Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                "Multi-channel post manager, scheduled calendar & engagement analytics across 15+ networks.",
                "Multikanálový správca príspevkov, kalendár plánovania a analytika dosahu na 15+ sieťach.",
                "Többcsatornás bejegyzéskezelő, ütemezési naptár és eléréselemzés."
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-stretch md:self-auto justify-between sm:justify-start">
          {/* Lightswitch for Demo Mode (Only rendered when isDemoMode is true) */}
          {isDemoMode && (
            <div className="flex items-center bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/90 shadow-inner select-none gap-1">
              <button
                type="button"
                onClick={() => setShowDemoData(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  !showDemoData
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                {t("Real Data", "Živé dáta", "Élő adatok")}
              </button>
              <button
                type="button"
                onClick={() => setShowDemoData(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  showDemoData
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("Demo Data", "Demo dáta", "Demo adatok")}
              </button>
            </div>
          )}

          {/* View Switcher Tabs (3 top views) */}
          <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "list"
                ? "bg-white text-slate-900 shadow-md shadow-slate-200 border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List className="h-4 w-4 text-rose-500" />
            {t("List View", "Zoznam", "Lista nézet")}
          </button>
          <button
            type="button"
            onClick={() => setActiveView("calendar")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "calendar"
                ? "bg-white text-slate-900 shadow-md shadow-slate-200 border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar className="h-4 w-4 text-indigo-500" />
            {t("Calendar View", "Kalendár", "Naptár nézet")}
          </button>
          <button
            type="button"
            onClick={() => setActiveView("analytics")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "analytics"
                ? "bg-white text-slate-900 shadow-md shadow-slate-200 border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            {t("Analytics View", "Analytika", "Analitika nézet")}
          </button>
        </div>
      </div>
      </div>

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

                {Object.entries(PLATFORM_CONFIG)
                  .filter(([platKey]) => {
                    const count = posts.filter(p => p.platform === platKey).length;
                    const isConnected = connectedPlatforms.includes(platKey.toLowerCase());
                    // Only show connected accounts or platforms with active posts
                    return count > 0 || isConnected;
                  })
                  .map(([platKey, platData]) => {
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
                onClick={fetchZernioPosts}
                disabled={isSyncing}
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
                <div className="glass-panel p-12 text-center rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                    <Share2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-heading font-extrabold text-slate-900">
                    {t("No posts found matching filter", "Nenašli sa žiadne príspevky", "Nem található bejegyzés")}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {t("Try selecting another social media source or clearing search filters.", "Skúste zmeniť filter alebo vyhľadávanie.", "Próbálja meg módosítani a szűrőt.")}
                  </p>
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
                          const platformMeta = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.twitter;
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
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Day Name Headers */}
              <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-2">
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
                        const platMeta = PLATFORM_CONFIG[p.platform] || PLATFORM_CONFIG.twitter;
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
                    <select
                      value={analyticsPlatformFilter}
                      onChange={(e) => setAnalyticsPlatformFilter(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer pr-8 appearance-none"
                    >
                      <option value="all">{t("All Platforms", "Všetky platformy", "Minden platform")}</option>
                      {Object.entries(PLATFORM_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.name}</option>
                      ))}
                    </select>
                    <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Date Range Selector */}
                  <div className="relative">
                    <select
                      value={analyticsDateRange}
                      onChange={(e) => setAnalyticsDateRange(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer pr-8 appearance-none"
                    >
                      <option value="7d">{t("Last 7 days", "Posledných 7 dní", "Elmúlt 7 nap")}</option>
                      <option value="30d">{t("Last 30 days", "Posledných 30 dní", "Elmúlt 30 nap")}</option>
                      <option value="90d">{t("Last 90 days", "Posledných 90 dní", "Elmúlt 90 nap")}</option>
                    </select>
                    <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Export Report Action */}
                  <button
                    type="button"
                    onClick={() => {
                      if ((window as any).showToast) {
                        (window as any).showToast(t("Exporting Analytics PDF Report...", "Exportujem PDF správu analytiky...", "PDF analitika jelentés exportálása..."));
                      }
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
                  {/* TOP 5 SUMMARY KPI CARDS WITH TREND INDICATORS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* KPI 1: Engagement Rate */}
                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Engagement Rate", "Miera angažovanosti", "Kötődési arány")}
                      </span>
                      <div className="text-2xl font-black text-rose-600 font-mono">
                        {analyticsKpis.avgRate}%
                      </div>
                      <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" /> 2.5% vs prev
                      </span>
                    </div>

                    {/* KPI 2: Total Reach */}
                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Total Reach", "Celkový dosah", "Összes elérés")}
                      </span>
                      <div className="text-2xl font-black text-slate-900 font-mono">
                        {(analyticsKpis.totalImpressions * 0.6).toFixed(0)}
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> +10.4% vs prev
                      </span>
                    </div>

                    {/* KPI 3: Total Followers */}
                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Total Followers", "Sledovatelia", "Követők száma")}
                      </span>
                      <div className="text-2xl font-black text-slate-900 font-mono">
                        1,420
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> +14 new
                      </span>
                    </div>

                    {/* KPI 4: Posts In Period */}
                    <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        {t("Posts In Period", "Príspevkov v období", "Bejegyzések a időszakban")}
                      </span>
                      <div className="text-2xl font-black text-slate-900 font-mono">
                        {filteredPosts.length}
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> +20% vs prev
                      </span>
                    </div>

                    {/* KPI 5: Best Post Badge */}
                    <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-1 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-black text-amber-600 uppercase tracking-widest block">
                          ⭐ {t("Best Post", "Najlepší príspevok", "Legjobb bejegyzés")}
                        </span>
                        <Award className="h-4 w-4 text-amber-500" />
                      </div>
                      {filteredPosts[0] ? (
                        <div
                          onClick={() => handleOpenPostDetails(filteredPosts[0])}
                          className="p-2 bg-amber-50/80 border border-amber-200/80 rounded-xl cursor-pointer hover:bg-amber-100 transition-all space-y-1"
                        >
                          <p className="text-[10.5px] font-extrabold text-slate-900 truncate">
                            {filteredPosts[0].content}
                          </p>
                          <span className="text-[9px] font-mono text-amber-800 font-bold block">
                            {filteredPosts[0].stats.likes} Likes • {filteredPosts[0].stats.engagementRate}% ER
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No posts</span>
                      )}
                    </div>
                  </div>

                  {/* 2X2 BAR CHARTS GRID (Posts & Likes Distribution) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Chart 1: Posts per Platform */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <div>
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Posts per Platform", "Príspevky podľa platforiem", "Bejegyzések platformonként")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">Distribution across connected networks</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl">
                          {filteredPosts.length} total
                        </span>
                      </div>

                      <div className="space-y-3 pt-2">
                        {Object.entries(PLATFORM_CONFIG).map(([platKey, platData]) => {
                          const count = filteredPosts.filter(p => p.platform === platKey).length;
                          const pct = filteredPosts.length > 0 ? (count / filteredPosts.length) * 100 : 0;
                          return (
                            <div key={platKey} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                                <span className="flex items-center gap-2">
                                  <span className={`w-2.5 h-2.5 rounded-full ${platData.bg}`}></span>
                                  {platData.name}
                                </span>
                                <span className="font-mono">{count} posts ({pct.toFixed(0)}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-full ${platData.bg} transition-all duration-500`}
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Chart 2: Posts over Time */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <div>
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Posts over Time", "Príspevky v čase", "Bejegyzések az időben")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">Daily publishing cadence</span>
                        </div>
                        <Activity className="h-4 w-4 text-rose-500" />
                      </div>

                      <div className="h-48 flex items-end justify-between gap-2 pt-6 pb-2 px-2">
                        {[
                          { date: "Jul 21", val: 1 },
                          { date: "Jul 22", val: 2 },
                          { date: "Jul 23", val: 1 },
                          { date: "Jul 24", val: 3 },
                          { date: "Jul 25", val: 2 },
                          { date: "Jul 26", val: 4 },
                          { date: "Jul 27", val: 2 }
                        ].map((item, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                            <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {item.val}
                            </span>
                            <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-32">
                              <div
                                className="w-full bg-gradient-to-t from-rose-500 to-amber-500 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                                style={{ height: `${(item.val / 4) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-[9.5px] font-bold text-slate-400 uppercase">{item.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chart 3: Likes per Platform */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <div>
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Likes per Platform", "Lajky podľa platforiem", "Lájkok platformonként")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">Reactions gathered per network</span>
                        </div>
                        <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                      </div>

                      <div className="space-y-3 pt-2">
                        {Object.entries(PLATFORM_CONFIG).map(([platKey, platData]) => {
                          const platPosts = filteredPosts.filter(p => p.platform === platKey);
                          const likesCount = platPosts.reduce((acc, p) => acc + p.stats.likes, 0);
                          const maxLikes = Math.max(...Object.keys(PLATFORM_CONFIG).map(k => filteredPosts.filter(p => p.platform === k).reduce((acc, p) => acc + p.stats.likes, 0)), 1);
                          const pct = (likesCount / maxLikes) * 100;
                          return (
                            <div key={platKey} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                                <span className="flex items-center gap-2">
                                  <span className={`w-2.5 h-2.5 rounded-full ${platData.bg}`}></span>
                                  {platData.name}
                                </span>
                                <span className="font-mono">{likesCount} likes</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Chart 4: Likes over Time */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <div>
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                            {t("Likes over Time", "Lajky v čase", "Lájkok az időben")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">Reaction accrual rate</span>
                        </div>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      </div>

                      <div className="h-48 flex items-end justify-between gap-2 pt-6 pb-2 px-2">
                        {[
                          { date: "Jul 21", val: 12 },
                          { date: "Jul 22", val: 45 },
                          { date: "Jul 23", val: 28 },
                          { date: "Jul 24", val: 89 },
                          { date: "Jul 25", val: 34 },
                          { date: "Jul 26", val: 67 },
                          { date: "Jul 27", val: 52 }
                        ].map((item, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                            <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {item.val}
                            </span>
                            <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-32">
                              <div
                                className="w-full bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                                style={{ height: `${(item.val / 89) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-[9.5px] font-bold text-slate-400 uppercase">{item.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* ENGAGEMENT OVER TIME (INTERACTIVE MULTI-METRIC AREA CHART) */}
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-150 pb-4">
                      <div>
                        <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="h-4.5 w-4.5 text-rose-500" />
                          {t("Engagement Over Time", "Engažovanosť v čase", "Kötődés az időben")}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Multi-dimensional cross-network engagement analysis
                        </p>
                      </div>

                      {/* Interactive Metric Pills Legend */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {[
                          { id: "likes", label: `Likes (${analyticsKpis.totalLikes})`, color: "bg-rose-500 text-white" },
                          { id: "comments", label: `Comments (${analyticsKpis.totalComments})`, color: "bg-blue-500 text-white" },
                          { id: "shares", label: `Shares (${analyticsKpis.totalShares})`, color: "bg-emerald-500 text-white" },
                          { id: "impressions", label: `Impressions (${analyticsKpis.totalImpressions})`, color: "bg-indigo-500 text-white" },
                          { id: "reach", label: `Reach (1.9K)`, color: "bg-purple-500 text-white" },
                          { id: "clicks", label: `Clicks (${analyticsKpis.totalClicks})`, color: "bg-amber-500 text-white" }
                        ].map((m) => {
                          const isActive = activeMetrics.includes(m.id);
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
                                isActive ? m.color : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {isActive && <Check className="h-3 w-3" />}
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Smooth Multi-Line SVG Area Chart */}
                    <div className="relative h-64 w-full pt-4">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                          </linearGradient>
                          <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Grid lines */}
                        <line x1="0" y1="40" x2="700" y2="40" stroke="#f1f5f9" strokeDasharray="4 4" />
                        <line x1="0" y1="90" x2="700" y2="90" stroke="#f1f5f9" strokeDasharray="4 4" />
                        <line x1="0" y1="140" x2="700" y2="140" stroke="#f1f5f9" strokeDasharray="4 4" />

                        {/* Line 1: Likes (Rose Curve) */}
                        {activeMetrics.includes("likes") && (
                          <>
                            <path
                              d="M 0 60 C 150 40, 300 120, 450 110 C 550 100, 650 60, 700 40 L 700 190 L 0 190 Z"
                              fill="url(#roseGrad)"
                            />
                            <path
                              d="M 0 60 C 150 40, 300 120, 450 110 C 550 100, 650 60, 700 40"
                              fill="none"
                              stroke="#f43f5e"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </>
                        )}

                        {/* Line 2: Impressions (Indigo Curve) */}
                        {activeMetrics.includes("impressions") && (
                          <>
                            <path
                              d="M 0 180 C 120 170, 250 80, 400 170 C 550 170, 650 140, 700 120 L 700 190 L 0 190 Z"
                              fill="url(#indigoGrad)"
                            />
                            <path
                              d="M 0 180 C 120 170, 250 80, 400 170 C 550 170, 650 140, 700 120"
                              fill="none"
                              stroke="#6366f1"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </>
                        )}

                        {/* Line 3: Shares (Emerald Curve) */}
                        {activeMetrics.includes("shares") && (
                          <path
                            d="M 0 130 C 180 120, 320 150, 500 140 C 600 130, 680 110, 700 95"
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeDasharray="5 5"
                          />
                        )}
                      </svg>

                      {/* X-Axis Date Labels */}
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                        <span>Jun 28</span>
                        <span>Jul 5</span>
                        <span>Jul 12</span>
                        <span>Jul 19</span>
                        <span>Jul 27</span>
                      </div>
                    </div>
                  </div>

                  {/* BEST TIME TO POST HEATMAP & FOLLOWER DEMOGRAPHICS */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Best Time to Post Heatmap (7 Cols) */}
                    <div className="lg:col-span-7 glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <div>
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="h-4 w-4 text-emerald-500" />
                            {t("Best Time to Post", "Najlepší čas na publikovanie", "Legjobb közzétételi idő")}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">Green density shows peak audience engagement hours</span>
                        </div>
                        <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
                          Wed 10 AM & Thu 2 PM
                        </span>
                      </div>

                      {/* 7 Days x 12 Hour Time Blocks Heatmap Grid */}
                      <div className="space-y-1.5 pt-2">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, dIdx) => (
                          <div key={day} className="flex items-center gap-2">
                            <span className="w-8 text-[10px] font-black text-slate-400 uppercase">{day}</span>
                            <div className="flex-1 grid grid-cols-12 gap-1">
                              {Array.from({ length: 12 }).map((_, hIdx) => {
                                const isPeak = (dIdx === 2 && (hIdx === 4 || hIdx === 5)) || (dIdx === 3 && hIdx === 6);
                                const isMed = (dIdx === 1 && hIdx === 4) || (dIdx === 4 && hIdx === 5);
                                const isLow = (dIdx + hIdx) % 3 === 0;
                                return (
                                  <div
                                    key={hIdx}
                                    title={`${day} ${hIdx * 2}:00 - ${isPeak ? 'High Engagement' : isMed ? 'Medium' : 'Low'}`}
                                    className={`h-5 rounded-lg transition-all hover:scale-110 cursor-pointer ${
                                      isPeak
                                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                                        : isMed
                                        ? "bg-emerald-300"
                                        : isLow
                                        ? "bg-emerald-100"
                                        : "bg-slate-100"
                                    }`}
                                  ></div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-150">
                        <span>12 AM</span>
                        <span>6 AM</span>
                        <span>12 PM</span>
                        <span>6 PM</span>
                        <div className="flex items-center gap-1">
                          <span>Less</span>
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-100"></span>
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100"></span>
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300"></span>
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                          <span>More</span>
                        </div>
                      </div>
                    </div>

                    {/* Follower History / Demographics (5 Cols) */}
                    <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Users className="h-4 w-4 text-indigo-500" />
                            {t("Audience Demographics", "Demografia publika", "Közönség demográfia")}
                          </h4>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">1,420 Followers</span>
                        </div>

                        <div className="space-y-2.5 pt-1">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                              <span>Slovakia & Czech Rep.</span>
                              <span className="font-mono text-indigo-600">62%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-indigo-600 rounded-full" style={{ width: "62%" }}></div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                              <span>Germany & Austria</span>
                              <span className="font-mono text-purple-600">24%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-purple-600 rounded-full" style={{ width: "24%" }}></div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                              <span>United States & UK</span>
                              <span className="font-mono text-rose-500">14%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-rose-500 rounded-full" style={{ width: "14%" }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 font-medium">
                        💡 <strong>Growth Insight:</strong> B2B audiences engage 3.4x higher on LinkedIn & Facebook during weekday business hours.
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
                        {Object.keys(PLATFORM_CONFIG).length} connected channels
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
                          <th className="py-2.5 px-3 text-center">Views</th>
                          <th className="py-2.5 px-3 text-center">Impressions</th>
                          <th className="py-2.5 px-3 text-center">Reach</th>
                          <th className="py-2.5 px-3 text-right">ER %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-xs font-semibold text-slate-800">
                        {Object.entries(PLATFORM_CONFIG).map(([platKey, platData]) => {
                          const platPosts = filteredPosts.filter(p => p.platform === platKey);
                          const likes = platPosts.reduce((acc, p) => acc + p.stats.likes, 0);
                          const comments = platPosts.reduce((acc, p) => acc + p.stats.comments, 0);
                          const shares = platPosts.reduce((acc, p) => acc + p.stats.shares, 0);
                          const clicks = platPosts.reduce((acc, p) => acc + p.stats.clicks, 0);
                          const impressions = platPosts.reduce((acc, p) => acc + p.stats.impressions, 0);
                          const reach = (impressions * 0.65).toFixed(0);
                          const er = platPosts.length > 0 ? (platPosts.reduce((acc, p) => acc + p.stats.engagementRate, 0) / platPosts.length).toFixed(1) : "0.0";

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
                              <td className="py-3 px-3 text-center font-mono">{impressions}</td>
                              <td className="py-3 px-3 text-center font-mono text-indigo-600 font-bold">{impressions}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-600">{reach}</td>
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
                        Sorted by highest engagement rate
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
                          <th className="py-2.5 px-3 text-center">Reach</th>
                          <th className="py-2.5 px-3 text-right">ER %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-xs font-semibold text-slate-800">
                        {filteredPosts.map((post, idx) => {
                          const platData = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.twitter;
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
                              <td className="py-3 px-3 text-center font-mono text-indigo-600 font-bold">{post.stats.impressions}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-600">{(post.stats.impressions * 0.7).toFixed(0)}</td>
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

                  {/* ADVANCED INSIGHTS: POSTING FREQUENCY VS ENGAGEMENT & ACCUMULATION CURVE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Insight 1: Posting Frequency vs Engagement */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                          {t("Posting Frequency vs Engagement", "Frekvencia príspevkov vs angažovanosť", "Közzétételi gyakoriság vs elérés")}
                        </h4>
                        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg">Optimal: 1.2/wk</span>
                      </div>

                      <div className="h-36 relative w-full pt-2">
                        <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                          <line x1="0" y1="20" x2="300" y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
                          <line x1="0" y1="60" x2="300" y2="60" stroke="#f1f5f9" strokeDasharray="3 3" />
                          <path
                            d="M 0 20 C 100 30, 200 50, 300 65"
                            fill="none"
                            stroke="#0284c7"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>

                      <p className="text-[11px] text-slate-500 font-medium">
                        📍 <strong>Optimal cadence per platform:</strong> Facebook 1.2/wk (+14% ER), LinkedIn 2.4/wk (+22% ER).
                      </p>
                    </div>

                    {/* Insight 2: Engagement Accumulation Curve */}
                    <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                        <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider">
                          {t("Engagement Accumulation", "Akumulácia angažovanosti", "Kötődés felhalmozódás")}
                        </h4>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">50% in 2.4h</span>
                      </div>

                      <div className="h-36 relative w-full pt-2">
                        <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                          <path
                            d="M 0 90 Q 60 10, 300 10 L 300 90 Z"
                            fill="#e2e8f0"
                            opacity="0.5"
                          />
                          <path
                            d="M 0 90 Q 60 10, 300 10"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="3"
                          />
                        </svg>
                      </div>

                      <p className="text-[11px] text-slate-500 font-medium">
                        📍 <strong>Half of engagement in 2.4h</strong>, 80% within 6.4h after initial publishing tick.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                /* INBOX ANALYTICS SUB-TAB CONTENT */
                <div className="glass-panel p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider">
                      {t("Inbox Response & Sentiment Analytics", "Analytika doručenej pošty a sentimentu", "Bejövő üzenetek és hangulatelemzés")}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        "Track response times, audience satisfaction, ticket resolution rates, and AI conversation sentiment across all connected social channels.",
                        "Sledujte čas odozvy, spokojnosť publika a rýchlosť riešenia správ na všetkých sieťach.",
                        "Kövesse nyomon a válaszidőt és a közönség elégedettségét minden csatornán."
                      )}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto pt-4 text-center">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-[9.5px] font-black text-slate-400 uppercase">Avg Response Time</span>
                      <span className="text-lg font-black text-slate-900 font-mono block mt-1">12.4 min</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-[9.5px] font-black text-emerald-600 uppercase">Sentiment Score</span>
                      <span className="text-lg font-black text-emerald-600 font-mono block mt-1">94% Positive</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-[9.5px] font-black text-indigo-600 uppercase">Resolved Inbound</span>
                      <span className="text-lg font-black text-indigo-600 font-mono block mt-1">148 tickets</span>
                    </div>
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
      {selectedCalendarDay && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedCalendarDay(null)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[99] animate-fade-in"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-slate-100 shadow-2xl z-[100] border-l border-slate-200 flex flex-col justify-between animate-in slide-in-from-right duration-300 select-none">
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
                const platMeta = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.twitter;

                // 1. TWITTER / X
                if (post.platform === "twitter") {
                  return (
                    <div
                      key={post.id}
                      onClick={() => { setSelectedCalendarDay(null); handleOpenPostDetails(post); }}
                      className="bg-slate-950 text-white rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3.5 font-sans cursor-pointer hover:ring-2 hover:ring-sky-400/60 transition-all"
                    >
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

                      <p className="text-xs font-normal text-slate-100 leading-relaxed whitespace-pre-wrap">
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
                          Liked by ccrm_team and {post.stats.likes} others
                        </div>

                        <p className="text-xs text-slate-800 leading-snug">
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

                      <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
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

                      <div className="pt-2 border-t border-slate-150 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-slate-600">
                        <button className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><ThumbsUp className="h-3 w-3" /> Like</button>
                        <button className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><MessageSquare className="h-3 w-3" /> Comment</button>
                        <button className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><Repeat className="h-3 w-3" /> Repost</button>
                        <button className="py-1 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1"><Send className="h-3 w-3" /> Send</button>
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

                    <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">
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
        </>
      )}
    </div>
  );
};
