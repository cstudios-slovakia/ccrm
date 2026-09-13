import React, { useState, useEffect } from 'react';
import { ShieldAlert, Zap, X, ArrowRight, Coins, FileText, Sparkles } from 'lucide-react';
import type { SwarmContextDocument } from '../../utils/swarm/types';

interface PreflightEstimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode?: 'demo' | 'live') => void;
  title: string;
  swarmScale: number;
  totalRounds: number;
  modelName: string;
  isDemoMode?: boolean;
  initialMode?: 'demo' | 'live';
  onModeChange?: (mode: 'demo' | 'live') => void;
  contextDocuments?: SwarmContextDocument[];
  systemLanguage?: string;
}

export const PreflightEstimatorModal: React.FC<PreflightEstimatorModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  swarmScale,
  totalRounds,
  modelName: _modelName,
  isDemoMode = false,
  initialMode,
  onModeChange,
  contextDocuments = [],
  systemLanguage = 'sk'
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;
  const isSk = systemLanguage === 'sk';

  const [currentMode, setCurrentMode] = useState<'demo' | 'live'>(
    initialMode || (isDemoMode ? 'demo' : 'live')
  );
  const [acknowledged, setAcknowledged] = useState(
    (initialMode || (isDemoMode ? 'demo' : 'live')) === 'demo'
  );

  useEffect(() => {
    if (isOpen) {
      const mode = initialMode || (isDemoMode ? 'demo' : 'live');
      setCurrentMode(mode);
      setAcknowledged(mode === 'demo');
    }
  }, [isOpen, initialMode, isDemoMode]);

  if (!isOpen) return null;

  // Formula calculations
  const ontologyTokens = 3000;
  const profileTokens = swarmScale * 600;
  const turnsPerSim = Math.round(swarmScale * totalRounds * 0.7); // 70% average activity due to diurnal cycle
  const simulationTokens = turnsPerSim * 450;
  const reportTokens = 8000;
  const attachedDocTokens = contextDocuments.reduce((acc, d) => acc + Math.round((d.content?.length || 0) / 4), 0);

  const totalTokens = ontologyTokens + profileTokens + simulationTokens + reportTokens + attachedDocTokens;
  const totalCalls = turnsPerSim + swarmScale + 6; // sim turns + profiles + ontology & report

  // Pricing estimators per 1M tokens
  const costGpt56Luna = (totalTokens / 1_000_000) * 0.25; // Cost-optimized
  const costGpt56Terra = (totalTokens / 1_000_000) * 1.50; // Heavy reasoning

  const isDemo = currentMode === 'demo';

  const handleModeSwitch = (newMode: 'demo' | 'live') => {
    setCurrentMode(newMode);
    setAcknowledged(newMode === 'demo');
    if (onModeChange) {
      onModeChange(newMode);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 border-b border-slate-200/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('Preflight Cost & Resource Estimate', 'Predbežný odhad nákladov a zdrojov', 'Előzetes költség- és erőforrás-becslés')}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {t('Rehearsal:', 'Simulácia:', 'Szimuláció:')} {title || t('Untitled', 'Bez názvu', 'Névtelen')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">

          {/* Interactive Mode Toggle in Modal */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50/80 via-slate-50 to-emerald-50/80 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-purple-600" />
                {t('Select Execution Mode:', 'Zvoľte režim vykonania:', 'Válasszon szimulációs módot:')}
              </span>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                {isDemo 
                  ? t('⚡ Fast demo test (synthetic run, $0 cost)', '⚡ Rýchly demo test (syntetický beh, 0 € náklad)', '⚡ Gyors demo teszt (szintetikus futás, 0 € költség)') 
                  : t('🚀 Live production simulation (real OpenAI LLM calls)', '🚀 Ostrá živá simulácia (reálne LLM volania OpenAI)', '🚀 Éles szimuláció (valódi OpenAI API hívások)')}
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleModeSwitch('demo')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isDemo
                    ? 'bg-emerald-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{t('Demo test', 'Demo test', 'Demo teszt')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeSwitch('live')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  !isDemo
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>{t('Live test', 'Živý test', 'Éles teszt')}</span>
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium block">
                {t('Swarm Scale', 'Veľkosť roju', 'Raj mérete')}
              </span>
              <span className="text-lg font-bold text-slate-800">
                {swarmScale} {t('Agents', 'Agentov', 'Ágens')}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {totalRounds} {t('simulated rounds', 'simulovaných kôl', 'szimulált kör')}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium block">
                {t('Estimated Calls', 'Odhadované volania', 'Becsült hívások')}
              </span>
              <span className="text-lg font-bold text-indigo-600">
                ~{totalCalls} {t('API calls', 'API volaní', 'API hívás')}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                ~{totalTokens.toLocaleString()} {t('tokens', 'tokenov', 'token')}
              </span>
            </div>
          </div>

          {/* Attached Context Documents Pill if any */}
          {contextDocuments.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-purple-50/70 border border-purple-200 text-xs">
              <span className="flex items-center gap-2 text-purple-900 font-semibold">
                <FileText className="w-4 h-4 text-purple-600" />
                <span>
                  {t(`Attached documents (${contextDocuments.length} files)`, `Priložené dokumenty (${contextDocuments.length} súb.)`, `Csatolt dokumentumok (${contextDocuments.length} db)`)}
                </span>
              </span>
              <span className="font-bold text-purple-700">~{attachedDocTokens.toLocaleString()} {t('tokens', 'tokenov', 'token')}</span>
            </div>
          )}

          {/* Pricing Comparison Cards */}
          <div className={`p-4 rounded-2xl border ${isDemo ? 'bg-emerald-50/70 border-emerald-200' : 'bg-purple-50/50 border-purple-100'}`}>
            <span className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${isDemo ? 'text-emerald-900' : 'text-purple-900'}`}>
              {isDemo 
                ? t('Active Demo Mode (Zero token consumption)', 'Aktívny demo režim (Žiadna spotreba tokenov)', 'Aktív demo mód (Nulla token fogyasztás)')
                : t('Estimated API Quota Costs (OpenAI)', 'Odhadované náklady na kvótu (OpenAI)', 'Becsült OpenAI API költség')}
            </span>
            <div className="space-y-2 text-xs">
              <div className={`flex justify-between items-center py-1 border-b border-slate-200/50 ${_modelName === 'gpt-5.6-luna' ? 'font-bold text-purple-700' : ''}`}>
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <span>{t('GPT-5.6 Luna (Cost-optimized)', 'GPT-5.6 Luna (Cenovo optimalizovaný)', 'GPT-5.6 Luna (Költségoptimalizált)')}</span>
                  {_modelName === 'gpt-5.6-luna' && <span className="px-1.5 py-0.2 text-[9px] bg-purple-100 text-purple-700 rounded-md font-extrabold">{t('ACTIVE', 'ZVOLENÉ', 'KIVÁLASZTVA')}</span>}
                </span>
                <span className="font-bold text-emerald-600">{isDemo ? (isSk ? '0.000 € (Demo)' : '$0.00 (Demo)') : `€${costGpt56Luna.toFixed(3)}`}</span>
              </div>
              <div className={`flex justify-between items-center py-1 ${_modelName === 'gpt-5.6-terra' ? 'font-bold text-purple-700' : ''}`}>
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <span>{t('GPT-5.6 Terra (Deep reasoning)', 'GPT-5.6 Terra (Hĺbkové uvažovanie)', 'GPT-5.6 Terra (Mély következtetés)')}</span>
                  {_modelName === 'gpt-5.6-terra' && <span className="px-1.5 py-0.2 text-[9px] bg-purple-100 text-purple-700 rounded-md font-extrabold">{t('ACTIVE', 'ZVOLENÉ', 'KIVÁLASZTVA')}</span>}
                </span>
                <span className="font-bold text-indigo-600">{isDemo ? (isSk ? '0.000 € (Demo)' : '$0.00 (Demo)') : `€${costGpt56Terra.toFixed(3)}`}</span>
              </div>
            </div>
          </div>

          {/* Safety Notice */}
          {isDemo ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>{t('Interactive Demo Mode:', 'Interaktívny demo režim:', 'Interaktív demo mód:')}</strong>{' '}
                {t(
                  'Runs locally with instant round streaming, animated graph nodes, and pre-computed briefings for UX evaluation.',
                  'Beží lokálne s okamžitým streamovaním kôl, animovanými uzlami grafu a predpripravenými briefingami na vyhodnotenie používateľského zážitku.',
                  'Helyben fut azonnali körökkel, animált tudásgráf csomópontokkal és előre kalkulált jelentésekkel a felhasználói élmény teszteléséhez.'
                )}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>{t('Live Real-Time Simulation:', 'Živá simulácia v reálnom čase:', 'Valós idejű éles szimuláció:')}</strong>{' '}
                {t(
                  'Executes live parallel OpenAI model calls with real-time CRM context extraction. Ensure you have an active internet connection.',
                  'Vykonáva skutočné paralelné volania OpenAI modelov vo vašom prehliadači s extrakciou kontextu z CRM. Uistite sa, že máte aktívne internetové pripojenie.',
                  'Valódi párhuzamos OpenAI hívásokat hajt végre a böngészőben valós idejű CRM kontextus kinyeréssel. Győződjön meg az aktív internetkapcsolatról.'
                )}
              </p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <label className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={acknowledged} 
              onChange={e => setAcknowledged(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <span className="text-xs font-semibold text-slate-700">
              {isDemo 
                ? t(
                    'I understand that this simulation runs in demo mode with synthetic responses.',
                    'Rozumiem, že táto simulácia beží v demo režime so simulovanými odpoveďami.',
                    'Tudomásul veszem, hogy ez a szimuláció demo módban fut szintetikus válaszokkal.'
                  )
                : t(
                    'I acknowledge that this simulation consumes OpenAI API quota and takes approx. 2–4 minutes.',
                    'Rozumiem, že táto simulácia bude čerpať API kvótu OpenAI a potrvá približne 2–4 minúty.',
                    'Tudomásul veszem, hogy a szimuláció OpenAI API kvótát fogyaszt és kb. 2-4 percig tart.'
                  )}
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-200/70 transition cursor-pointer"
          >
            {t('Cancel & Edit', 'Zrušiť / Upraviť nastavenia', 'Mégse / Beállítások módosítása')}
          </button>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={() => {
              onClose();
              onConfirm(currentMode);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition ${
              acknowledged 
                ? (isDemo 
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 cursor-pointer active:scale-95' 
                    : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:opacity-95 cursor-pointer active:scale-95')
                : 'bg-slate-300 cursor-not-allowed opacity-60'
            }`}
          >
            <span>
              {isDemo 
                ? t('Confirm & Launch Demo', 'Potvrdiť & Spustiť Demo', 'Megerősítés & Demo indítása') 
                : t('Confirm & Launch Live API', 'Potvrdiť & Spustiť naživo (Live)', 'Megerősítés & Éles indítás (Live)')}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
