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
  AlertTriangle 
} from 'lucide-react';

interface StrategicReportViewProps {
  report: StrategicReport;
  onOpenQaDrawer?: () => void;
  onOpenAgentDirectory: () => void;
  agents?: SwarmAgentProfile[];
  posts?: SwarmPost[];
  hypothesis?: string;
  isDemoMode?: boolean;
}

export const StrategicReportView: React.FC<StrategicReportViewProps> = ({
  report,
  onOpenQaDrawer,
  onOpenAgentDirectory,
  agents = [],
  posts = [],
  hypothesis = '',
  isDemoMode = false
}) => {
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
                  Validated Market Rehearsal Briefing
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
                  <span>Ask Intelligence Chatbot</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAgentDirectory}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  <span>Interview Simulated Agents</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-xs font-medium text-slate-300 transition ml-auto"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
                </button>
              </div>
            </div>
          </div>

      {/* Strategic Playbook Callout Box (The "What Strategy to Use to Achieve the Goal?" Section) */}
      {playbook && (
        <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/80 via-white to-purple-50/80 border border-emerald-200/80 shadow-md space-y-5">
          <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-base">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Target className="w-4 h-4" />
            </div>
            <span>🎯 Strategic Playbook: How to Achieve the Goal</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vulnerabilities */}
            <div className="p-4 rounded-2xl bg-white border border-rose-100 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Critical Vulnerabilities Uncovered</span>
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
                <span>Actionable Counter-Measures</span>
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
                Turn-Key Sales Objection Rebuttals (For Account Reps)
              </span>
              <div className="space-y-3">
                {playbook.salesObjectionPlaybook.map((obj, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                    <div className="font-semibold text-rose-700">
                      🚨 Prospect Objection: "{obj.objection}"
                    </div>
                    <div className="text-slate-700 font-medium pl-2 border-l-2 border-emerald-500">
                      💡 Rebuttal Script: {obj.rebuttal}
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
          />
        </div>

      </div>
    </div>
  );
};
