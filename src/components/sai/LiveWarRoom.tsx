import React from 'react';
import type { 
  SwarmKnowledgeGraph, 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmRoundMetrics 
} from '../../utils/swarm/types';
import { SwarmGraphCanvas } from './SwarmGraphCanvas';
import { SocialFeedStream } from './SocialFeedStream';
import { Sun, Moon, Pause, Activity, TrendingUp, Users } from 'lucide-react';

interface LiveWarRoomProps {
  title: string;
  currentRound: number;
  totalRounds: number;
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  latestMetrics?: SwarmRoundMetrics | null;
  isRunning: boolean;
  onStop: () => void;
}

export const LiveWarRoom: React.FC<LiveWarRoomProps> = ({
  title,
  currentRound,
  totalRounds,
  graph,
  agents,
  posts,
  latestMetrics,
  isRunning,
  onStop
}) => {
  const latestPost = posts.length > 0 ? posts[posts.length - 1] : null;
  const activeAgent = latestPost ? agents.find(a => a.id === latestPost.agentId) : null;
  const activeEntityId = activeAgent?.sourceEntityId || null;

  const simulatedHour = latestMetrics?.simulatedHour ?? (((currentRound - 1) * 3) % 24);
  const isNight = simulatedHour >= 22 || simulatedHour <= 6;

  const progressPercent = Math.min(100, Math.round((currentRound / totalRounds) * 100));

  return (
    <div className="flex flex-col h-full space-y-4">
      
      {/* Top War Room HUD */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
        
        {/* Title & Simulation Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                {isRunning ? 'Live Simulating' : 'Paused / Concluded'}
              </span>
            </div>
            <p className="text-xs text-slate-500">Autonomous multi-agent market rehearsal in progress</p>
          </div>
        </div>

        {/* Metrics Ticker */}
        <div className="flex items-center gap-6 text-xs">
          
          {/* Simulated Time / Circadian Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            {isNight ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Simulated Time</span>
              <span className="font-bold text-slate-800">{String(simulatedHour).padStart(2, '0')}:00 CET</span>
            </div>
          </div>

          {/* Stance Breakdown */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <Users className="w-4 h-4 text-slate-500" />
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Sentiment Stances</span>
              <div className="flex items-center gap-2 font-bold text-[11px]">
                <span className="text-emerald-600">+{latestMetrics?.supportiveCount || 0}</span>
                <span className="text-slate-400">/</span>
                <span className="text-rose-600">-{latestMetrics?.opposingCount || 0}</span>
              </div>
            </div>
          </div>

          {/* Viral Index */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Viral Heat</span>
              <span className="font-bold text-purple-700">{latestMetrics?.viralIndex ?? 0}%</span>
            </div>
          </div>

          {/* Stop Button */}
          {isRunning && (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Conclude Early</span>
            </button>
          )}

        </div>

      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Split Grid: Left Graph, Right Feed */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[500px]">
        
        {/* Left 7 Columns: Knowledge Graph */}
        <div className="lg:col-span-7 h-full">
          <SwarmGraphCanvas 
            graph={graph} 
            activeEntityId={activeEntityId} 
            className="h-full min-h-[450px]" 
          />
        </div>

        {/* Right 5 Columns: Live Feed Stream */}
        <div className="lg:col-span-5 h-full">
          <SocialFeedStream 
            posts={posts} 
            className="h-full min-h-[450px]" 
          />
        </div>

      </div>

    </div>
  );
};
