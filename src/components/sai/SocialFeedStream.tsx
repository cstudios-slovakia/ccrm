import React, { useRef, useEffect, useState } from 'react';
import { SwarmPost } from '../../utils/swarm/types';
import { MessageSquare, Heart, Repeat2, Twitter, MessageCircle, Sparkles } from 'lucide-react';

interface SocialFeedStreamProps {
  posts: SwarmPost[];
  className?: string;
}

export const SocialFeedStream: React.FC<SocialFeedStreamProps> = ({
  posts,
  className = "w-full h-full"
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to top when new posts arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [posts.length, autoScroll]);

  const sortedPosts = [...posts].reverse();

  const getStanceBadge = (score: number) => {
    if (score > 0.25) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Supportive</span>;
    } else if (score < -0.25) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Opposing</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Neutral</span>;
  };

  return (
    <div className={`flex flex-col bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden ${className}`}>
      
      {/* Header Bar */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></div>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Live Feed Stream ({posts.length} Posts)
          </span>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${
            autoScroll 
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
              : 'bg-slate-200 text-slate-600'
          }`}
        >
          {autoScroll ? 'Auto-scroll On' : 'Auto-scroll Paused'}
        </button>
      </div>

      {/* Feed List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y divide-slate-100 scrollbar-thin scrollbar-thumb-slate-200"
      >
        {sortedPosts.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
            <Sparkles className="w-6 h-6 text-slate-300" />
            <span>Waiting for round 1 to begin...</span>
          </div>
        ) : (
          sortedPosts.map((post) => (
            <div 
              key={post.id} 
              className="pt-3.5 first:pt-0 animate-in fade-in slide-in-from-top-2 duration-300 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                    {post.agentName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition">
                        {post.agentName}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">@{post.agentUsername}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{post.agentProfession}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getStanceBadge(post.sentimentScore)}
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-500">
                    R{post.roundNum}
                  </span>
                </div>
              </div>

              {/* Post Content */}
              <div className="mt-2 text-xs text-slate-700 leading-relaxed pl-10">
                {post.content}
              </div>

              {/* Engagement Stats */}
              <div className="mt-2.5 pl-10 flex items-center gap-5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 hover:text-rose-500 transition cursor-pointer">
                  <Heart className="w-3.5 h-3.5" />
                  <span>{post.likesCount || 0}</span>
                </span>
                <span className="flex items-center gap-1 hover:text-indigo-500 transition cursor-pointer">
                  <Repeat2 className="w-3.5 h-3.5" />
                  <span>{post.quotesCount || 0}</span>
                </span>
                <span className="flex items-center gap-1 hover:text-blue-500 transition cursor-pointer">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{post.commentsCount || 0}</span>
                </span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                  {post.platform === 'twitter' ? <Twitter className="w-3 h-3 text-sky-500" /> : <MessageCircle className="w-3 h-3 text-orange-500" />}
                  <span className="capitalize">{post.platform}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
