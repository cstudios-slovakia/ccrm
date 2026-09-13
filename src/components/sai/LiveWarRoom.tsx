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
  systemLanguage?: string;
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
  onStop,
  systemLanguage = 'sk'
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;
  const latestPost = posts.length > 0 ? posts[posts.length - 1] : null;
  const activeAgent = latestPost ? agents.find(a => a.id === latestPost.agentId) : null;
  const activeEntityId = activeAgent?.sourceEntityId || null;

  const simulatedHour = latestMetrics?.simulatedHour ?? (((currentRound - 1) * 3) % 24);
  const isNight = simulatedHour >= 22 || simulatedHour <= 6;

  const progressPercent = Math.min(100, Math.round((currentRound / totalRounds) * 100));

  return (
    <div className="flex flex-col h-full space-y-4 min-h-0 overflow-hidden">
      
      {/* Top War Room HUD */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4 shrink-0">
        
        {/* Title & Simulation Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                {isRunning 
                  ? t('Simulation Active', 'Simulácia prebieha', 'Szimuláció folyamatban') 
                  : t('Paused / Complete', 'Pozastavené / Ukončené', 'Szünetel / Befejezve')}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {t('Autonomous multi-agent market simulation in progress', 'Prebieha autonómna simulácia trhu s viacerými agentmi', 'Autonóm többágenses piaci szimuláció folyamatban')}
            </p>
          </div>
        </div>

        {/* Metrics Ticker */}
        <div className="flex items-center gap-6 text-xs">
          
          {/* Simulated Time / Circadian Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            {isNight ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                {t('Simulated Time', 'Simulovaný čas', 'Szimulált idő')}
              </span>
              <span className="font-bold text-slate-800">{String(simulatedHour).padStart(2, '0')}:00 CET</span>
            </div>
          </div>

          {/* Stance Breakdown */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <Users className="w-4 h-4 text-slate-500" />
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                {t('Stance Distribution', 'Rozdelenie postojov', 'Álláspontok megoszlása')}
              </span>
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
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                {t('Viral Index', 'Virálna odozva', 'Virális index')}
              </span>
              <span className="font-bold text-purple-700">{latestMetrics?.viralIndex ?? 0}%</span>
            </div>
          </div>

          {/* Stop Button */}
          {isRunning && (
            <button
              onClick={onStop}
              className="px-4 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{t('Pause', 'Pozastaviť', 'Szüneteltetés')}</span>
            </button>
          )}

        </div>
      </div>

      {/* Progress Line */}
      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shrink-0">
        <div 
          className="bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 h-full transition-all duration-500" 
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Main Dual Grid: Ontology Graph (Left 60%) + Feed Stream (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        
        {/* Left: Swarm Ontology Graph Canvas */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-0">
          <SwarmGraphCanvas 
            graph={graph} 
            activeEntityId={activeEntityId} 
            systemLanguage={systemLanguage}
          />
        </div>

        {/* Right: Social Stream */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-0">
          <SocialFeedStream 
            posts={posts} 
            systemLanguage={systemLanguage}
          />
        </div>

      </div>

    </div>
  );
};
