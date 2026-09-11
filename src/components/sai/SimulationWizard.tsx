import React, { useState } from 'react';
import { 
  Sparkles, 
  X, 
  ArrowRight, 
  Calendar, 
  Users, 
  Clock, 
  Bot,
  FileText
} from 'lucide-react';
import type { SimulationParameters } from '../../utils/swarm/types';
import { PreflightEstimatorModal } from './PreflightEstimatorModal';

interface SimulationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (params: SimulationParameters) => void;
  isSubmitting?: boolean;
  isDemoMode?: boolean;
}

const PRESET_TEMPLATES = [
  {
    name: 'Enterprise Pricing Increase',
    title: 'Q4 25% Price Adjustment Rehearsal',
    hypothesis: 'What if we raise Enterprise CRM tier prices by 25% while adding 99.9% uptime SLA and dedicated Slack channel support?',
    seed: `We are preparing to announce a 25% price increase across all Enterprise plans starting next month.
Current Enterprise rate: €199/month. Proposed rate: €249/month.
In exchange, clients will receive:
- Guaranteed 1-hour SLA response time for critical issues
- Direct dedicated Slack/WhatsApp support channel with our engineering team
- Free migration assistance for legacy databases
Existing customers will receive a grandfathered 6-month grace period before the rate applies.
Target audience: 20-200 employee digital agencies and manufacturing SMBs.`
  },
  {
    name: 'Competitor Response Defense',
    title: 'Counter-Offensive vs Legacy CRM Vendor',
    hypothesis: 'What if our primary legacy competitor launches an aggressive ad campaign attacking our missing phone dialer feature?',
    seed: `Competitor X is rumored to launch a targeted campaign highlighting our current lack of built-in VoIP telephony.
Our strategic counter-positioning:
- We focus on deep workflow automation, instant multi-channel WhatsApp integration, and modern UI speed rather than legacy call centers.
- Most modern sales teams communicate via async messaging, video calls, and email rather than cold calling.
- We integrate seamlessly with third-party PBX/Twilio via Webhooks.`
  },
  {
    name: 'New Feature Rollout (Self-Service SAI)',
    title: 'Swarm AI Public Beta Launch Rehearsal',
    hypothesis: 'What if we launch autonomous predictive simulation (SAI) as a premium add-on at €49/month?',
    seed: `We are rolling out Swarm Artificial Intelligence (SAI), allowing businesses to simulate market reactions to new products, PR announcements, and sales strategies before going live.
The feature runs multi-agent social swarms grounded in the company's real CRM lead and objection history.
Pricing: €49/month for 10 rehearsals per month, or pay-as-you-go proxy usage.
We want to gauge whether sales executives find this compelling or if they are skeptical of AI simulation validity.`
  }
];

export const SimulationWizard: React.FC<SimulationWizardProps> = ({
  isOpen,
  onClose,
  onLaunch,
  isSubmitting = false,
  isDemoMode = false
}) => {
  const [title, setTitle] = useState('Q4 Strategy Market Rehearsal');
  const [hypothesis, setHypothesis] = useState(
    'What if we introduce annual billing with a 20% discount and eliminate monthly plans for new accounts?'
  );
  const [seedDocument, setSeedDocument] = useState(
    `We are considering restructuring our billing model. For all new accounts, we will require an annual commitment, offering a 20% total discount compared to our old monthly rates. Current clients may remain on monthly billing. Our target clients are B2B service agencies and consultancies.`
  );
  const [lookbackMonths, setLookbackMonths] = useState<6 | 12 | 24>(12);
  const [swarmScale, setSwarmScale] = useState<number>(30);
  const [totalRounds, setTotalRounds] = useState<number>(8);
  const platforms: 'dual' | 'twitter' | 'reddit' = 'dual';
  const [diurnalCycle, setDiurnalCycle] = useState<boolean>(true);
  const [llmModel, setLlmModel] = useState<string>('gpt-4o-mini');

  const [showEstimatorModal, setShowEstimatorModal] = useState(false);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setTitle(preset.title);
    setHypothesis(preset.hypothesis);
    setSeedDocument(preset.seed);
  };

  const handleOpenEstimator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hypothesis.trim() || !seedDocument.trim()) {
      alert('Please fill in the rehearsal title, hypothesis, and seed context.');
      return;
    }
    setShowEstimatorModal(true);
  };

  const handleConfirmedLaunch = () => {
    setShowEstimatorModal(false);
    onLaunch({
      title,
      hypothesis,
      seedDocument,
      lookbackMonths,
      swarmScale,
      totalRounds,
      platforms,
      diurnalCycle,
      llmModel
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-3xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">Configure Swarm Rehearsal (SAI)</h2>
                  {isDemoMode && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Demo Mode
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {isDemoMode 
                    ? 'Interactive test rehearsal using simulated fast local generation'
                    : 'Initialize multi-agent simulation grounded in real CRM interactions'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleOpenEstimator} className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
            
            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-600" />
                Quick Templates
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESET_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(tmpl)}
                    className="p-2.5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 text-left transition group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-700 truncate">
                      {tmpl.name}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">
                      {tmpl.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Rehearsal Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Rehearsal Title <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Q4 Enterprise Pricing Restructuring"
                required
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm text-slate-800 font-medium"
              />
            </div>

            {/* Hypothesis / What-If */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>What-If Variable / Hypothesis <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-slate-400 font-normal">Core predictive focus</span>
              </label>
              <input 
                type="text"
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
                placeholder="e.g. What if we raise rates by 25% while offering a 99.9% uptime SLA?"
                required
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm text-slate-800 font-medium"
              />
            </div>

            {/* Seed Context Document */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>Seed Scenario & Announcement Text <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-slate-400 font-normal">Press release, email draft, or memo</span>
              </label>
              <textarea 
                rows={4}
                value={seedDocument}
                onChange={e => setSeedDocument(e.target.value)}
                placeholder="Paste the announcement text, draft release, or proposed pricing memo that agents will read and debate..."
                required
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm text-slate-800 font-normal resize-y"
              />
            </div>

            {/* Simulation Engine Parameters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {/* CRM Lookback Horizon */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  CRM Lookback Horizon
                </label>
                <p className="text-[11px] text-slate-500">
                  Selects active leads, clients, and lost deal objections from the past months:
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[6, 12, 24].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setLookbackMonths(months as 6 | 12 | 24)}
                      className={`py-2 rounded-xl text-xs font-bold transition ${
                        lookbackMonths === months
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {months} Mo {months === 12 && '⭐'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Swarm Scale */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-600" />
                  Swarm Scale (Agents)
                </label>
                <p className="text-[11px] text-slate-500">
                  Number of autonomous buyer & competitor personas synthesized:
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { count: 15, label: '15 (Fast)' },
                    { count: 30, label: '30 (Std) ⭐' },
                    { count: 60, label: '60 (Deep)' }
                  ].map(opt => (
                    <button
                      key={opt.count}
                      type="button"
                      onClick={() => setSwarmScale(opt.count)}
                      className={`py-2 rounded-xl text-xs font-bold transition ${
                        swarmScale === opt.count
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Rounds */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Simulation Rounds ({totalRounds} rounds)
                </label>
                <p className="text-[11px] text-slate-500">
                  Simulates ~{Math.round(totalRounds * 3)} hours of real-world debate:
                </p>
                <input 
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={totalRounds}
                  onChange={e => setTotalRounds(parseInt(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                  <span>5 (Quick Probe)</span>
                  <span>8 (Balanced)</span>
                  <span>20 (Full Narrative)</span>
                </div>
              </div>

              {/* LLM Engine & Diurnal Toggle */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-slate-700" />
                  Intelligence Model
                </label>
                <select 
                  value={llmModel}
                  onChange={e => setLlmModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (High Speed & Cost-Optimized) ⭐</option>
                  <option value="gpt-4o">GPT-4o (Deep Cognitive Reasoning)</option>
                  <option value="deepseek-chat">DeepSeek Chat (V3 Reasoning)</option>
                  <option value="qwen-plus">Qwen Plus</option>
                </select>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-600 font-medium">Diurnal Sleep Cycle</span>
                  <input 
                    type="checkbox"
                    checked={diurnalCycle}
                    onChange={e => setDiurnalCycle(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 accent-purple-600"
                  />
                </div>
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-sm transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center gap-2"
              >
                <span>Review & Estimate Tokens</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </form>

        </div>
      </div>

      {/* Pre-Flight Cost Estimator Modal (Mandatory before launching) */}
      <PreflightEstimatorModal
        isOpen={showEstimatorModal}
        onClose={() => setShowEstimatorModal(false)}
        onConfirm={handleConfirmedLaunch}
        title={title}
        swarmScale={swarmScale}
        totalRounds={totalRounds}
        modelName={llmModel}
        isDemoMode={isDemoMode}
      />
    </>
  );
};
