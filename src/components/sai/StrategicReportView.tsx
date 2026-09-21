import React, { useState } from 'react';
import type { 
  StrategicReport, 
  SwarmAgentProfile, 
  SwarmPost 
} from '../../utils/swarm/types';
import { Markdown } from '../../utils/markdown';
import { QaAssistantDrawer } from './QaAssistantDrawer';
import { 
  Target, 
  ShieldCheck, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  MessageSquare, 
  AlertTriangle,
  Award,
  Lightbulb,
  Sparkles,
  Quote
} from 'lucide-react';

interface StrategicReportViewProps {
  report: StrategicReport;
  onOpenQaDrawer?: () => void;
  onOpenAgentDirectory: () => void;
  agents?: SwarmAgentProfile[];
  posts?: SwarmPost[];
  hypothesis?: string;
  isDemoMode?: boolean;
  systemLanguage?: string;
}

export const StrategicReportView: React.FC<StrategicReportViewProps> = ({
  report,
  onOpenAgentDirectory,
  onOpenQaDrawer,
  agents = [],
  posts = [],
  hypothesis = '',
  isDemoMode = false,
  systemLanguage = 'sk'
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;
  const [copied, setCopied] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});

  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleCopyMarkdown = () => {
    const md = `# ${report.title}\n\n${report.summary}\n\n` + 
      report.sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFocusChatbot = () => {
    if (onOpenQaDrawer) {
      onOpenQaDrawer();
    }
    const el = document.getElementById('sai-interrogation-input');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const playbook = report.strategicPlaybook;
  const verdict = report.executiveVerdict;

  return (
    <div className="w-full max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col lg:flex-row items-start gap-6">
        
        {/* Left Column: Strategic Report Content */}
        <div className="flex-1 min-w-0 space-y-6 w-full">
          
          {/* Header Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {t('Validated Executive Briefing', 'Validovaný manažérsky briefing', 'Hitelesített vezetői összefoglaló')}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(report.generatedAt).toLocaleDateString()}
                </span>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-white">{report.title}</h1>
              <p className="text-sm text-slate-300 leading-relaxed font-normal">{report.summary}</p>

              <div className="pt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleFocusChatbot}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-emerald-500 hover:opacity-95 text-xs font-bold text-white shadow-md transition cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{t('Ask AI Chatbot', 'Spýtať sa AI chatbota', 'Kérdezze az MI chatbotot')}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAgentDirectory}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  <span>{t('Interrogate Agents', 'Výsluch simulovaných agentov', 'Ágensek kikérdezése')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-xs font-medium text-slate-300 transition ml-auto cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t('Copied!', 'Skopírované', 'Másolva!') : t('Copy Markdown', 'Kopírovať Markdown', 'Markdown másolása')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Executive Verdict (Answer Mode Hero Card) */}
          {verdict && (
            <div className="p-7 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white shadow-xl border border-indigo-500/30 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-5">
                {/* Header Badge & Confidence */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-gradient-to-r from-purple-500/30 to-indigo-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 shadow-xs">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      {t('Executive Answer & Verdict', 'Výkonný verdikt simulácie', 'Vezetői válasz és döntési verdikt')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-300 font-medium">
                      {t('Convergence Confidence:', 'Istota konvergencie:', 'Konvergencia megbízhatósága:')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {verdict.confidenceScore}%
                    </span>
                  </div>
                </div>

                {/* Stated Strategic Question */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {t('Question Evaluated by Swarm', 'Zodpovedaná otázka trhu', 'A raj által megválaszolt kérdés')}
                  </span>
                  <p className="text-sm font-semibold text-slate-100 italic">
                    &ldquo;{verdict.question}&rdquo;
                  </p>
                </div>

                {/* Direct Answer Callout */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-900/60 via-indigo-900/50 to-slate-900/80 border border-purple-500/40 space-y-2 shadow-inner">
                  <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase tracking-wider">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>{t('Direct Answer / Market Outcome', 'Priama odpoveď / Rozhodnutie trhu', 'Közvetlen válasz / Piaci eredmény')}</span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {verdict.directAnswer}
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    {verdict.summary}
                  </p>
                </div>

                {/* Answer Distribution (Breakdown Bar) */}
                {verdict.answerBreakdown && verdict.answerBreakdown.length > 0 && (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                      {t('Market Preference Distribution', 'Rozdelenie preferencií na trhu', 'Piaci preferencia megoszlása')}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {verdict.answerBreakdown.map((item, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-100 block truncate" title={item.answer}>
                              {item.answer}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {item.count} {t('supporters', 'priaznivcov', 'támogató')}
                            </span>
                          </div>
                          <span className="text-sm font-black text-purple-300 px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/30">
                            {item.sharePercentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Why is this the answer? (3 Evidence Drivers) */}
                {verdict.keyDrivers && verdict.keyDrivers.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <Lightbulb className="w-4 h-4 text-emerald-400" />
                      <span>{t('Why is this the answer? (Primary Evidence Drivers)', 'Prečo je takáto odpoveď? (Kľúčové faktory rozhodnutia)', 'Miért ez a válasz? (Fő döntési tényezők)')}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {verdict.keyDrivers.map((driver, dIdx) => (
                        <div key={dIdx} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition space-y-2.5 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
                                {dIdx + 1}
                              </span>
                              <span>{driver.title}</span>
                            </h4>
                            <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                              {driver.explanation}
                            </p>
                          </div>

                          {driver.quotes && driver.quotes.length > 0 && (
                            <div className="pt-2 border-t border-white/10 space-y-1">
                              {driver.quotes.slice(0, 1).map((q, qIdx) => (
                                <p key={qIdx} className="text-[10px] text-slate-400 italic flex items-start gap-1">
                                  <Quote className="w-3 h-3 text-emerald-400/60 shrink-0 mt-0.5" />
                                  <span>&ldquo;{q}&rdquo;</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* What would change the outcome */}
                {verdict.whatWouldChangeOutcome && verdict.whatWouldChangeOutcome.length > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                      {t('What could flip or alter this outcome?', 'Čo by mohlo zmeniť alebo zvrátiť tento výsledok?', 'Mi változtathatná meg ezt az eredményt?')}
                    </span>
                    <ul className="space-y-1 text-xs text-amber-100/90">
                      {verdict.whatWouldChangeOutcome.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Strategic Playbook Callout Box */}
          {playbook && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/80 via-white to-purple-50/80 border border-emerald-200/80 shadow-md space-y-5">
              <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-base">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <Target className="w-4 h-4" />
                </div>
                <span>
                  {t('🎯 Strategic Action Plan: Roadmap to Objective', '🎯 Strategický akčný plán: Ako dosiahnuť cieľ', '🎯 Stratégiai akcióterv: Útiterv a célhoz')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vulnerabilities */}
                <div className="p-4 rounded-2xl bg-white border border-rose-100 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>{t('Identified Critical Vulnerabilities', 'Odhalené kritické zraniteľnosti', 'Feltárt kritikus sebezhetőségek')}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {playbook.keyVulnerabilities?.map((v, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-500 font-bold">•</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Counter-Measures */}
                <div className="p-4 rounded-2xl bg-white border border-emerald-100 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>{t('Actionable Counter-Measures', 'Realizovateľné protiopatrenia', 'Végrehajtható ellenintézkedések')}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {playbook.actionableCounterMeasures?.map((cm, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{cm}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Sales Objection Rebuttal Script */}
              {playbook.salesObjectionPlaybook && playbook.salesObjectionPlaybook.length > 0 && (
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    {t('Sales Objection Rebuttal Playbook (for Commercial Team)', 'Pripravené odpovede na obchodné námietky (pre obchodníkov)', 'Értékesítési kifogáskezelési útmutató (az értékesítőknek)')}
                  </span>
                  <div className="space-y-3">
                    {playbook.salesObjectionPlaybook.map((obj, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                        <div className="font-semibold text-rose-700">
                          {t('🚨 Buyer Objection:', '🚨 Námietka zákazníka:', '🚨 Vevői kifogás:')} &ldquo;{obj.objection}&rdquo;
                        </div>
                        <div className="text-slate-700 font-medium pl-2 border-l-2 border-emerald-500">
                          {t('💡 Recommended Rebuttal:', '💡 Odporúčaná odpoveď:', '💡 Javasolt válasz:')} {obj.rebuttal}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Report Sections (Collapsible) */}
          <div className="space-y-4">
            {report.sections.map((section, idx) => {
              const isCollapsed = collapsedSections[idx] ?? false;
              return (
                <div 
                  key={idx} 
                  className="rounded-3xl bg-white border border-slate-200/80 shadow-sm overflow-hidden transition"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(idx)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50/60 transition cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <h3 className="text-base font-bold text-slate-900">{section.title}</h3>
                    </div>
                    {isCollapsed ? <ChevronRight className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </button>

                  {!isCollapsed && (
                    <div className="px-6 pb-6 pt-4 text-xs text-slate-700 leading-relaxed border-t border-slate-100/80 font-sans">
                      <Markdown content={section.content} className="space-y-2.5 text-xs text-slate-700 leading-relaxed" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Right Column: Always Visible Sticky Chatbot Card */}
        <div className="w-full lg:w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 lg:sticky lg:top-[88px] self-start z-20">
          <QaAssistantDrawer
            isOpen={true}
            embedded={true}
            report={report}
            agents={agents}
            posts={posts}
            hypothesis={hypothesis}
            isDemoMode={isDemoMode}
            systemLanguage={systemLanguage}
          />
        </div>

      </div>
    </div>
  );
};
