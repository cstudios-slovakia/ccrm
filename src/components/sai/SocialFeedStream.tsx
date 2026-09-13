import React, { useRef, useEffect, useState } from 'react';
import type { SwarmPost } from '../../utils/swarm/types';
import { Markdown } from '../../utils/markdown';
import { MessageSquare, Heart, Repeat2, Sparkles, MessageCircle, MessagesSquare } from 'lucide-react';

interface SocialFeedStreamProps {
  posts: SwarmPost[];
  className?: string;
  systemLanguage?: string;
}

export const SocialFeedStream: React.FC<SocialFeedStreamProps> = ({
  posts,
  className = "w-full h-full",
  systemLanguage = 'sk'
}) => {
  const isSk = systemLanguage === 'sk';
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
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {isSk ? 'Podporujúci' : 'Supporting'}
        </span>
      );
    } else if (score < -0.25) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {isSk ? 'Nesúhlasný' : 'Opposing'}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        {isSk ? 'Neutrálny' : 'Neutral'}
      </span>
    );
  };

  return (
    <div className={`flex flex-col h-full min-h-0 bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden ${className}`}>
      
      {/* Header Bar */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></div>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {isSk ? `Živý kanál príspevkov (${posts.length} príspevkov)` : `Live Feed Stream (${posts.length} posts)`}
          </span>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
            autoScroll 
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
              : 'bg-slate-200 text-slate-600'
          }`}
        >
          {autoScroll 
            ? (isSk ? 'Automatické posúvanie zap.' : 'Auto-scroll ON') 
            : (isSk ? 'Automatické posúvanie pozastavené' : 'Auto-scroll paused')}
        </button>
      </div>

      {/* Feed List Container */}
      <div 
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200"
      >
        {sortedPosts.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
            <Sparkles className="w-6 h-6 text-slate-300" />
            <span>{isSk ? 'Čaká sa na začiatok 1. kola...' : 'Waiting for Round 1 deliberation to begin...'}</span>
          </div>
        ) : (
          sortedPosts.map((post) => (
            <div 
              key={post.id} 
              className="p-3.5 bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 rounded-2xl shadow-xs hover:shadow-sm transition duration-200 animate-in fade-in slide-in-from-top-2 duration-300 group flex flex-col space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-sm shrink-0">
                    {post.agentName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition truncate">
                        {post.agentName}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono truncate">@{post.agentUsername}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block truncate">{post.agentProfession}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {getStanceBadge(post.sentimentScore)}
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200/60 text-slate-600 font-mono">
                    R{post.roundNum}
                  </span>
                </div>
              </div>

              {/* Post Content */}
              <div className="text-xs text-slate-700 leading-relaxed pl-0">
                <Markdown content={post.content} className="space-y-1 text-xs text-slate-700" />
              </div>

              {/* Engagement Stats */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-4">
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
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-medium">
                  {post.platform === 'forum' || post.platform === 'reddit' ? (
                    <span className="flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200/80">
                      <MessagesSquare className="w-3 h-3 text-amber-600" />
                      <span>Forum</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200/80">
                      <MessageCircle className="w-3 h-3 text-indigo-600" />
                      <span>Chitchat</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
