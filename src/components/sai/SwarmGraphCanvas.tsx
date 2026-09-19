import React, { useRef, useState } from 'react';
import type { SwarmKnowledgeGraph, SwarmEntityNode, SwarmAgentProfile } from '../../utils/swarm/types';
import { ZoomIn, ZoomOut, RotateCcw, X, Sparkles, Loader2, Network, Users } from 'lucide-react';

interface SwarmGraphCanvasProps {
  graph: SwarmKnowledgeGraph;
  agents?: SwarmAgentProfile[];
  activeEntityId?: string | null;
  className?: string;
  systemLanguage?: string;
  isPreparing?: boolean;
  prepStepMessage?: string;
}

interface ColorScheme {
  primary: string;
  gradientStart: string;
  gradientEnd: string;
  glow: string;
  badgeBg: string;
  badgeText: string;
}

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  Client: {
    primary: '#2563eb', // sapphire blue
    gradientStart: '#3b82f6',
    gradientEnd: '#1d4ed8',
    glow: 'rgba(37, 99, 235, 0.25)',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8'
  },
  Competitor: {
    primary: '#e11d48', // crimson rose
    gradientStart: '#fb7185',
    gradientEnd: '#be123c',
    glow: 'rgba(225, 29, 72, 0.25)',
    badgeBg: '#fff1f2',
    badgeText: '#be123c'
  },
  Regulator: {
    primary: '#d97706', // amber gold
    gradientStart: '#f59e0b',
    gradientEnd: '#b45309',
    glow: 'rgba(217, 119, 6, 0.25)',
    badgeBg: '#fffbeb',
    badgeText: '#b45309'
  },
  Agency: {
    primary: '#7c3aed', // royal purple
    gradientStart: '#a855f7',
    gradientEnd: '#6d28d9',
    glow: 'rgba(124, 58, 237, 0.25)',
    badgeBg: '#faf5ff',
    badgeText: '#6d28d9'
  },
  Stakeholder: {
    primary: '#059669', // emerald green
    gradientStart: '#10b981',
    gradientEnd: '#047857',
    glow: 'rgba(5, 150, 105, 0.25)',
    badgeBg: '#ecfdf5',
    badgeText: '#047857'
  }
};

const DEFAULT_SCHEME: ColorScheme = {
  primary: '#4f46e5',
  gradientStart: '#6366f1',
  gradientEnd: '#4338ca',
  glow: 'rgba(79, 70, 229, 0.25)',
  badgeBg: '#eef2ff',
  badgeText: '#4338ca'
};

const renderNodeIcon = (type: string) => {
  switch (type) {
    case 'Client':
      return (
        <path
          d="M4 20h16M7 20V4h10v16M10 8h1M13 8h1M10 12h1M13 12h1M10 16h1M13 16h1"
          stroke="#ffffff"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform="translate(-7.5, -7.5) scale(0.62)"
        />
      );
    case 'Competitor':
      return (
        <path
          d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
          fill="#ffffff"
          transform="translate(-6.6, -6.6) scale(0.55)"
        />
      );
    case 'Regulator':
      return (
        <path
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform="translate(-7, -7) scale(0.6)"
        />
      );
    case 'Agency':
      return (
        <path
          d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"
          fill="#ffffff"
          transform="translate(-6.6, -6.6) scale(0.55)"
        />
      );
    case 'Stakeholder':
    default:
      return (
        <path
          d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          stroke="#ffffff"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform="translate(-7.5, -7.5) scale(0.62)"
        />
      );
  }
};

export const SwarmGraphCanvas: React.FC<SwarmGraphCanvasProps> = ({
  graph,
  agents = [],
  activeEntityId,
  className = "w-full h-full min-h-[380px]",
  systemLanguage = 'sk',
  isPreparing = false,
  prepStepMessage
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;

  const typeLabels: Record<string, string> = {
    Client: t('Client', 'Klient', 'Ügyfél'),
    Competitor: t('Competitor', 'Konkurent', 'Versenytárs'),
    Regulator: t('Regulator', 'Regulátor', 'Szabályozó'),
    Agency: t('Agency', 'Agentúra', 'Ügynökség'),
    Stakeholder: t('Stakeholder', 'Účastník', 'Érintett'),
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<SwarmEntityNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const isSynthesizing = isPreparing || graph.nodes.length === 0;

  // Layout calculation: circular orbit layout with calibrated radial spacing
  const nodePositions = React.useMemo(() => {
    const map = new Map<string, { x: number; y: number; scheme: ColorScheme }>();
    const count = graph.nodes.length;
    if (count === 0) return map;

    const centerX = 300;
    const centerY = 200;
    const radius = Math.min(210, 90 + count * 8);

    graph.nodes.forEach((node, index) => {
      const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
      const r = radius * (0.8 + ((index % 3) * 0.12));
      const x = Math.round(centerX + r * Math.cos(angle));
      const y = Math.round(centerY + r * Math.sin(angle));
      const scheme = COLOR_SCHEMES[node.type] || DEFAULT_SCHEME;
      map.set(node.id, { x, y, scheme });
    });

    return map;
  }, [graph.nodes]);

  const selectedPos = selectedNode ? nodePositions.get(selectedNode.id) : null;
  const connectedEdges = selectedNode 
    ? graph.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id) 
    : [];

  const POPOVER_WIDTH = 264;
  const POPOVER_HEIGHT = 126;

  const isAbove = selectedPos ? selectedPos.y >= 130 : true;
  const popoverX = selectedPos ? Math.max(12, Math.min(600 - POPOVER_WIDTH - 12, selectedPos.x - POPOVER_WIDTH / 2)) : 0;
  const popoverY = selectedPos ? (isAbove ? selectedPos.y - POPOVER_HEIGHT - 22 : selectedPos.y + 44) : 0;
  const arrowBaseX = selectedPos ? Math.max(popoverX + 22, Math.min(popoverX + POPOVER_WIDTH - 22, selectedPos.x)) : 0;
  const arrowPoints = selectedPos ? (isAbove
    ? `${arrowBaseX - 8},${popoverY + POPOVER_HEIGHT} ${arrowBaseX + 8},${popoverY + POPOVER_HEIGHT} ${selectedPos.x},${selectedPos.y - 20}`
    : `${arrowBaseX - 8},${popoverY} ${arrowBaseX + 8},${popoverY} ${selectedPos.x},${selectedPos.y + 40}`) : '';

  return (
    <div ref={containerRef} className={`relative bg-slate-50/70 rounded-3xl border border-slate-200/80 overflow-hidden flex flex-col shadow-xs ${className}`}>
      
      {/* Top Left Status Badge */}
      <div className="absolute top-3.5 left-3.5 z-10 flex items-center gap-2">
        {isSynthesizing ? (
          <div className="px-3 py-1.5 rounded-full bg-purple-900/90 backdrop-blur-md border border-purple-400/50 text-[11px] font-bold text-white flex items-center gap-2 shadow-md animate-in fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-purple-300" />
              {t('Synthesizing Dynamic Knowledge Graph...', 'Syntéza dynamického grafu znalostí...', 'Dinamikus tudásgráf szintetizálása...')}
            </span>
          </div>
        ) : (
          <div className="px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 text-[11px] font-bold text-slate-700 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{t('Knowledge Graph', 'Graf znalostí', 'Tudásgráf')} ({graph.nodes.length} {t('nodes', 'uzlov', 'csomópont')}, {graph.edges.length} {t('relations', 'väzieb', 'kapcsolat')})</span>
          </div>
        )}
      </div>

      {/* Top Right Zoom & Pan Controls */}
      <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5">
        <button 
          type="button"
          onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 2.0))}
          className="p-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90 shadow-xs transition cursor-pointer"
          title={t('Zoom in', 'Priblížiť', 'Nagyítás')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          type="button"
          onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.6))}
          className="p-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90 shadow-xs transition cursor-pointer"
          title={t('Zoom out', 'Oddialiť', 'Kicsinyítés')}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button 
          type="button"
          onClick={() => {
            setZoomLevel(1);
            setSelectedNode(null);
          }}
          className="p-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90 shadow-xs transition cursor-pointer"
          title={t('Reset view', 'Resetovať zobrazenie', 'Nézet visszaállítása')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Category Legend */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs text-[10px] font-medium text-slate-600">
        <span className="font-bold text-slate-400 uppercase text-[9px] mr-0.5">{t('Entities:', 'Subjekty:', 'Entitások:')}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600"></span>{t('Client', 'Klient', 'Ügyfél')}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600"></span>{t('Competitor', 'Konkurent', 'Versenytárs')}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-600"></span>{t('Regulator', 'Regulátor', 'Szabályozó')}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-600"></span>{t('Agency', 'Agentúra', 'Ügynökség')}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600"></span>{t('Market Participant', 'Účastník trhu', 'Piaci résztvevő')}</span>
      </div>

      {/* Ingestion & Synthesis Active Overlay when nodes are empty or preparing */}
      {isSynthesizing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/20 backdrop-blur-[3px] animate-in fade-in duration-300">
          <div className="max-w-lg w-full p-6 rounded-3xl bg-white/95 border border-purple-200/90 shadow-2xl text-center space-y-4 backdrop-blur-md">
            <div className="relative w-14 h-14 mx-auto">
              <div className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-lg">
                <Network className="w-7 h-7 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-purple-600" />
                {t('AI Swarm Knowledge Synthesis', 'AI syntéza znalostného grafu', 'MI tudásgráf szintézis')}
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                {t('Constructing Dynamic Market Knowledge Graph...', 'Vytváranie dynamického grafu trhu...', 'Dinamikus piaci tudásgráf felépítése...')}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto font-normal">
                {prepStepMessage || t(
                  'Extracting stakeholder entities, competitor stances, and relationship edges from CRM context and scenario...',
                  'Extrakcia entít stakeholderov, postojov konkurencie a väzieb z CRM kontextu a zadania...',
                  'Érintetti entitások, versenytársi álláspontok és kapcsolatok kinyerése a CRM kontextusból és forgatókönyvből...'
                )}
              </p>
            </div>

            {/* Live Synthesized Personas Tag Cloud */}
            {agents && agents.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-100 text-left">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1">
                  <span className="flex items-center gap-1.5 text-purple-900">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    {t('Synthesized Autonomous Personas:', 'Vytvorené autonómne persóny:', 'Létrehozott autonóm perszónák:')}
                  </span>
                  <span className="text-[10px] text-purple-700 font-extrabold px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200">
                    {agents.length} {t('created', 'vytvorených', 'kész')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {agents.map((ag) => (
                    <span 
                      key={ag.id} 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-purple-50/60 border border-slate-200/90 text-[10.5px] font-bold text-slate-800 animate-in fade-in zoom-in-95 duration-200 shadow-2xs"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{ag.displayName}</span>
                      <span className="text-slate-400 font-normal text-[9.5px]">({ag.profession})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-purple-700 bg-purple-50/80 py-2 px-4 rounded-xl border border-purple-100">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span>
                {agents.length > 0
                  ? t(`Synthesizing swarm personas (${agents.length} generated)...`, `Generujú sa persóny roja (${agents.length} hotových)...`, `Raj perszónák szintézise (${agents.length} kész)...`)
                  : t('Synthesizing social entities & ontology via OpenAI...', 'Syntéza sociálnych entít a ontológie cez OpenAI...', 'Társas entitások és ontológia szintézise OpenAI-n keresztül...')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SVG Canvas Area */}
      <div className="flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing">
        <svg 
          viewBox="0 0 600 400" 
          className="w-full h-full transition-transform duration-300"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Defs: Gradients, Filters, Markers, Grid */}
          <defs>
            {/* Clean Dot Matrix Grid */}
            <pattern id="light-graph-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill="#94a3b8" opacity="0.32" />
            </pattern>

            {/* Premium Drop Shadows */}
            <filter id="node-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3.5" stdDeviation="3.5" floodColor="#0f172a" floodOpacity="0.16" />
            </filter>

            <filter id="label-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.07" />
            </filter>

            {/* Edge Direction Arrow Markers */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="23"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
            </marker>

            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="25"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#4f46e5" />
            </marker>

            {/* Linear Gradients for Node Types */}
            <linearGradient id="grad-Client" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="grad-Competitor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#be123c" />
            </linearGradient>
            <linearGradient id="grad-Regulator" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="grad-Agency" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id="grad-Stakeholder" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="grad-Default" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>
          </defs>

          {/* Light Base Canvas */}
          <rect width="100%" height="100%" fill="#f8fafc" />

          {/* Dot Grid */}
          <rect 
            width="100%" 
            height="100%" 
            fill="url(#light-graph-grid)" 
            onClick={() => setSelectedNode(null)}
            className="cursor-default"
          />

          {/* Radar Intelligence Guideline Rings */}
          <g className="pointer-events-none select-none opacity-45">
            <circle cx="300" cy="200" r="90" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 4" />
            <circle cx="300" cy="200" r="170" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 5" />
            <circle cx="300" cy="200" r="235" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5 6" />
            <line x1="285" y1="200" x2="315" y2="200" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="300" y1="185" x2="300" y2="215" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
          </g>

          {/* Edges */}
          <g className="edges">
            {graph.edges.map((edge) => {
              const src = nodePositions.get(edge.source);
              const tgt = nodePositions.get(edge.target);
              if (!src || !tgt) return null;

              const isEdgeConnected = selectedNode 
                ? (edge.source === selectedNode.id || edge.target === selectedNode.id)
                : false;

              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2;
              const badgeWidth = Math.max(54, edge.relation.length * 5.8 + 14);

              return (
                <g 
                  key={edge.id} 
                  className={`transition-opacity duration-200 ${
                    selectedNode 
                      ? (isEdgeConnected ? 'opacity-100' : 'opacity-20') 
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <line 
                    x1={src.x} 
                    y1={src.y} 
                    x2={tgt.x} 
                    y2={tgt.y} 
                    stroke={isEdgeConnected && selectedPos ? selectedPos.scheme.primary : "#94a3b8"} 
                    strokeWidth={isEdgeConnected ? "2.5" : "1.5"}
                    strokeDasharray={edge.invalidFromRound ? "4 4" : undefined}
                    markerEnd={isEdgeConnected ? "url(#arrow-active)" : "url(#arrow-default)"}
                  />

                  {/* Midpoint Relational Pill */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-badgeWidth / 2}
                      y={-8}
                      width={badgeWidth}
                      height={16}
                      rx={5}
                      fill="#ffffff"
                      stroke={isEdgeConnected && selectedPos ? selectedPos.scheme.primary : "#e2e8f0"}
                      strokeWidth={isEdgeConnected ? "1.5" : "1"}
                      filter="url(#label-shadow)"
                    />
                    <text 
                      x={0} 
                      y={3.5} 
                      fill={isEdgeConnected && selectedPos ? selectedPos.scheme.primary : "#475569"} 
                      fontSize="7.5" 
                      fontWeight="700"
                      textAnchor="middle"
                      letterSpacing="0.05em"
                      className="select-none pointer-events-none font-mono uppercase"
                    >
                      {edge.relation}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {graph.nodes.map((node) => {
              const pos = nodePositions.get(node.id);
              if (!pos) return null;

              const isActive = activeEntityId === node.id;
              const isSelected = selectedNode?.id === node.id;
              const isNeighbor = selectedNode && connectedEdges.some(e => e.source === node.id || e.target === node.id);

              const displayName = node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name;
              const pillWidth = Math.max(68, displayName.length * 5.6 + 22);
              const pillY = isSelected ? 23 : 21;

              return (
                <g 
                  key={node.id} 
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(prev => prev?.id === node.id ? null : node);
                  }}
                  className={`cursor-pointer group transition-all duration-200 ${
                    selectedNode && !isSelected && !isNeighbor ? 'opacity-35 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  {/* Pulse Ring for Active Simulation Persona */}
                  {isActive && (
                    <>
                      <circle 
                        r="26" 
                        fill="none" 
                        stroke={pos.scheme.primary} 
                        strokeWidth="2" 
                        className="animate-ping opacity-60"
                      />
                      <circle 
                        r="22" 
                        fill={pos.scheme.primary} 
                        fillOpacity="0.1" 
                        stroke={pos.scheme.primary} 
                        strokeWidth="1.5" 
                        strokeDasharray="3 3"
                      />
                    </>
                  )}

                  {/* Selected Accent Halo */}
                  {isSelected && (
                    <circle
                      r="23"
                      fill="none"
                      stroke={pos.scheme.primary}
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                      className="animate-spin-slow opacity-80"
                    />
                  )}

                  {/* Main Node Sphere */}
                  <circle 
                    r={isSelected ? 18 : (isActive ? 17 : 15)} 
                    fill={`url(#grad-${node.type in COLOR_SCHEMES ? node.type : 'Default'})`} 
                    stroke="#ffffff" 
                    strokeWidth={isSelected ? '3' : '2.5'}
                    filter="url(#node-shadow)"
                    className="transition-transform duration-300 group-hover:scale-110"
                  />

                  {/* Specular Highlight / 3D Gloss Rim */}
                  <ellipse
                    cx="0"
                    cy={isSelected ? -7 : -6}
                    rx={isSelected ? 9 : 7.5}
                    ry={isSelected ? 3.5 : 3}
                    fill="#ffffff"
                    fillOpacity="0.4"
                    className="pointer-events-none"
                  />

                  {/* Crisp White Category Vector Icon */}
                  <g className="pointer-events-none">
                    {renderNodeIcon(node.type)}
                  </g>

                  {/* Node Label Pill */}
                  <g className="pointer-events-none select-none">
                    <rect
                      x={-pillWidth / 2}
                      y={pillY}
                      width={pillWidth}
                      height={18}
                      rx={9}
                      fill="#ffffff"
                      stroke={isSelected ? pos.scheme.primary : (isNeighbor ? '#cbd5e1' : '#e2e8f0')}
                      strokeWidth={isSelected ? '1.5' : '1'}
                      filter="url(#label-shadow)"
                    />
                    {/* Category Dot */}
                    <circle
                      cx={-pillWidth / 2 + 8}
                      cy={pillY + 9}
                      r={3}
                      fill={pos.scheme.primary}
                    />
                    {/* Label Text */}
                    <text 
                      x={-pillWidth / 2 + 15} 
                      y={pillY + 12.5} 
                      fill={isSelected ? '#0f172a' : '#334155'} 
                      fontSize={isSelected ? "9.5" : "9"} 
                      fontWeight={isSelected ? "700" : "600"}
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {displayName}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Active / Clicked Entity Popover Overlay (Positioned Directly Above Node) */}
          {selectedNode && selectedPos && (
            <g className="entity-popover-overlay animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              {/* Caret Arrow pointing down to node */}
              <polygon
                points={arrowPoints}
                fill="#ffffff"
                stroke={selectedPos.scheme.primary}
                strokeWidth="1.5"
                className="drop-shadow-sm"
              />

              {/* Popover Bubble Card */}
              <foreignObject
                x={popoverX}
                y={popoverY}
                width={POPOVER_WIDTH}
                height={POPOVER_HEIGHT}
                className="overflow-visible"
              >
                <div 
                  className="w-full h-full bg-white/98 border border-slate-200/90 rounded-2xl p-3.5 shadow-2xl text-slate-800 flex flex-col justify-between select-none backdrop-blur-md"
                  style={{ 
                    borderColor: `${selectedPos.scheme.primary}50`, 
                    boxShadow: `0 12px 28px -4px ${selectedPos.scheme.primary}20, 0 8px 12px -6px rgba(0,0,0,0.06)` 
                  }}
                >
                  {/* Popover Header */}
                  <div className="flex items-start justify-between gap-1 border-b border-slate-100 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: selectedPos.scheme.primary }}
                      />
                      <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]" title={selectedNode.name}>
                        {selectedNode.name}
                      </span>
                      <span 
                        className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider border shrink-0"
                        style={{ 
                          backgroundColor: selectedPos.scheme.badgeBg, 
                          color: selectedPos.scheme.badgeText,
                          borderColor: `${selectedPos.scheme.primary}35`
                        }}
                      >
                        {typeLabels[selectedNode.type] || selectedNode.type}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(null);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 -mt-0.5 -mr-0.5"
                      title={t('Close explanation', 'Zavrieť vysvetlenie', 'Magyarázat bezárása')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Popover Explanation */}
                  <div className="flex-1 py-1.5 overflow-hidden">
                    <p className="text-[10.5px] text-slate-600 leading-snug line-clamp-3 font-normal">
                      {selectedNode.summary || t('Simulated entity participating in market interactions and discussions.', 'Simulovaný subjekt zúčastňujúci sa trhových interakcií a diskusie.', 'A piaci interakciókban és vitákban részt vevő szimulált entitás.')}
                    </p>
                  </div>

                  {/* Popover Footer Relations */}
                  {connectedEdges.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[9.5px]">
                      <span className="font-semibold text-slate-400 uppercase text-[9px]">{t('Relation:', 'Väzba:', 'Kapcsolat:')}</span>
                      <span className="font-mono text-indigo-600 font-bold truncate max-w-[160px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        {connectedEdges[0].relation} → {
                          connectedEdges[0].source === selectedNode.id 
                            ? (graph.nodes.find(n => n.id === connectedEdges[0].target)?.name || t('Entity', 'Subjekt', 'Entitás'))
                            : (graph.nodes.find(n => n.id === connectedEdges[0].source)?.name || t('Entity', 'Subjekt', 'Entitás'))
                        }
                      </span>
                    </div>
                  )}
                </div>
              </foreignObject>
            </g>
          )}

        </svg>
      </div>

    </div>
  );
};
