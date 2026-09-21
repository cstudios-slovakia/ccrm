import React from 'react';
import type { 
  SwarmKnowledgeGraph, 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmRoundMetrics 
} from '../../utils/swarm/types';
import { SwarmGraphCanvas } from './SwarmGraphCanvas';
import { SocialFeedStream } from './SocialFeedStream';
import { Sun, Moon, Pause, Play, Edit3, Activity, TrendingUp, Users, Target } from 'lucide-react';

interface LiveWarRoomProps {
  title: string;
  currentRound: number;
  totalRounds: number;
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  latestMetrics?: SwarmRoundMetrics | null;
  isRunning: boolean;
  isPreparing?: boolean;
  prepStepMessage?: string;
  onStop: () => void;
  onRestart?: () => void;
  onEditDraft?: () => void;
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
  isPreparing = false,
  prepStepMessage,
  onStop,
  onRestart,
  onEditDraft,
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
              {isPreparing ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                  {t('Ingesting Swarm & Knowledge Graph...', 'Ingescia a syntéza roju...', 'Raj betöltése és szintézise...')}
                </span>
              ) : isRunning ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t('Simulation Active', 'Simulácia prebieha', 'Szimuláció folyamatban')}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  {currentRound >= totalRounds ? t('Completed', 'Dokončená', 'Befejezve') : t('Paused / Ready', 'Pozastavená / Pripravená', 'Szünetel / Kész')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {isPreparing 
                ? t('Synthesizing dynamic ontology and initializing autonomous agents...', 'Prebieha syntéza dynamickej ontológie a inicializácia autonómnych agentov...', 'Dinamikus ontológia szintézise és autonóm ágensek inicializálása...')
                : t('Autonomous multi-agent market simulation in progress', 'Prebieha autonómna simulácia trhu s viacerými agentmi', 'Autonóm többágenses piaci szimuláció folyamatban')}
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

          {/* Answer Mode Leading Answer Meter */}
          {latestMetrics?.leadingAnswer && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-purple-50/80 border border-purple-200/80 shadow-xs">
              <Target className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-purple-600 block font-bold uppercase tracking-wider">
                  {t('Leading Answer', 'Vedúca odpoveď', 'Vezető válasz')}
                </span>
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-purple-900 truncate max-w-[170px]">
                  <span className="truncate" title={latestMetrics.leadingAnswer}>{latestMetrics.leadingAnswer}</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-purple-200/70 text-purple-800 font-extrabold shrink-0">
                    {latestMetrics.consensusPercentage ?? 0}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isPreparing ? (
            <div className="px-4 py-2 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs flex items-center gap-2 shadow-xs">
              <span className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <span>{t('Synthesizing...', 'Spracováva sa...', 'Szintetizálás...')}</span>
            </div>
          ) : isRunning ? (
            <button
              onClick={onStop}
              className="px-4 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{t('Pause', 'Pozastaviť', 'Szüneteltetés')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {onEditDraft && (
                <button
                  onClick={onEditDraft}
                  className="px-3 py-1.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                  <span>{t('Edit Config', 'Upraviť konfiguráciu', 'Konfiguráció szerkesztése')}</span>
                </button>
              )}
              {onRestart && (
                <button
                  onClick={onRestart}
                  className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>{t('Launch / Re-run', 'Spustiť / Znovu spustiť', 'Indítás / Újrafuttatás')}</span>
                </button>
              )}
            </div>
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

      {/* Dynamic Answer Consensus Live Bar */}
      {latestMetrics?.answerDistribution && Object.keys(latestMetrics.answerDistribution).length > 0 && (
        <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('Live Answer Consensus:', 'Priebežný konsenzus odpovedí:', 'Élő válaszkonszenzus:')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(latestMetrics.answerDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([ans, count], i) => {
                const total = agents.length || 1;
                const pct = Math.round((count / total) * 100);
                const isLeader = i === 0;
                return (
                  <div 
                    key={ans}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border ${
                      isLeader 
                        ? 'bg-purple-100/90 text-purple-900 border-purple-300 ring-1 ring-purple-300 shadow-xs' 
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>{ans}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isLeader ? 'bg-purple-600 text-white font-extrabold' : 'bg-slate-200 text-slate-700'}`}>
                      {pct}% ({count})
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Main Dual Grid: Ontology Graph (Left 60%) + Feed Stream (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        
        {/* Left: Swarm Ontology Graph Canvas */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-0">
          <SwarmGraphCanvas 
            graph={graph} 
            agents={agents}
            activeEntityId={activeEntityId} 
            systemLanguage={systemLanguage}
            isPreparing={isPreparing}
            prepStepMessage={prepStepMessage}
          />
        </div>

        {/* Right: Social Stream */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-0">
          <SocialFeedStream 
            posts={posts} 
            systemLanguage={systemLanguage}
            onRestart={onRestart}
            onEditDraft={onEditDraft}
            isPreparing={isPreparing}
            prepStepMessage={prepStepMessage}
          />
        </div>

      </div>

    </div>
  );
};
