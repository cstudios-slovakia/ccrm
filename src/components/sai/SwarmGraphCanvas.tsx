import React, { useRef, useState } from 'react';
import type { SwarmKnowledgeGraph, SwarmEntityNode } from '../../utils/swarm/types';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface SwarmGraphCanvasProps {
  graph: SwarmKnowledgeGraph;
  activeEntityId?: string | null;
  className?: string;
}

export const SwarmGraphCanvas: React.FC<SwarmGraphCanvasProps> = ({
  graph,
  activeEntityId,
  className = "w-full h-full min-h-[380px]"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<SwarmEntityNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Simple, robust layout calculation (circular orbit layout with jitter for stability)
  const nodePositions = React.useMemo(() => {
    const map = new Map<string, { x: number; y: number; color: string }>();
    const count = graph.nodes.length;
    if (count === 0) return map;

    const centerX = 300;
    const centerY = 200;
    const radius = Math.min(220, 80 + count * 8);

    const colors: Record<string, string> = {
      Client: '#3b82f6', // blue
      Competitor: '#ef4444', // red
      Regulator: '#f59e0b', // amber
      Agency: '#8b5cf6', // purple
      Stakeholder: '#10b981' // emerald
    };

    graph.nodes.forEach((node, index) => {
      const angle = (index / count) * 2 * Math.PI;
      const r = radius * (0.75 + ((index % 3) * 0.15));
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      const color = colors[node.type] || '#6366f1';
      map.set(node.id, { x, y, color });
    });

    return map;
  }, [graph.nodes]);

  return (
    <div ref={containerRef} className={`relative bg-slate-950 rounded-3xl border border-slate-800/80 overflow-hidden flex flex-col ${className}`}>
      
      {/* Top Overlay Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Knowledge Graph ({graph.nodes.length} Nodes, {graph.edges.length} Edges)</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        <button 
          onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 2.0))}
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.6))}
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoomLevel(1)}
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing">
        <svg 
          viewBox="0 0 600 400" 
          className="w-full h-full transition-transform duration-300"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Subtle Grid Background */}
          <defs>
            <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#334155" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid)" />

          {/* Edges */}
          <g className="edges">
            {graph.edges.map((edge) => {
              const src = nodePositions.get(edge.source);
              const tgt = nodePositions.get(edge.target);
              if (!src || !tgt) return null;

              return (
                <g key={edge.id} className="transition-opacity opacity-50 hover:opacity-100">
                  <line 
                    x1={src.x} 
                    y1={src.y} 
                    x2={tgt.x} 
                    y2={tgt.y} 
                    stroke="#475569" 
                    strokeWidth="1.5"
                    strokeDasharray={edge.invalidFromRound ? "4 4" : undefined}
                  />
                  <text 
                    x={(src.x + tgt.x) / 2} 
                    y={(src.y + tgt.y) / 2 - 4} 
                    fill="#94a3b8" 
                    fontSize="8" 
                    textAnchor="middle"
                    className="select-none pointer-events-none font-mono"
                  >
                    {edge.relation}
                  </text>
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

              return (
                <g 
                  key={node.id} 
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setSelectedNode(node)}
                  className="cursor-pointer group"
                >
                  {/* Pulse Ring for Active Node */}
                  {isActive && (
                    <circle 
                      r="22" 
                      fill="none" 
                      stroke={pos.color} 
                      strokeWidth="2" 
                      className="animate-ping opacity-75"
                    />
                  )}

                  {/* Main Node Circle */}
                  <circle 
                    r={isSelected ? 16 : (isActive ? 14 : 11)} 
                    fill={pos.color} 
                    stroke={isSelected ? '#ffffff' : '#0f172a'} 
                    strokeWidth={isSelected ? '3' : '2'}
                    className="transition-all duration-300 group-hover:scale-125 shadow-lg"
                  />

                  {/* Node Label */}
                  <text 
                    y="22" 
                    fill="#e2e8f0" 
                    fontSize="9.5" 
                    fontWeight="600"
                    textAnchor="middle" 
                    className="select-none font-sans drop-shadow-md pointer-events-none"
                  >
                    {node.name.length > 18 ? node.name.slice(0, 16) + '…' : node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 p-3.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white flex items-start justify-between shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="space-y-1 max-w-[85%]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{selectedNode.name}</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {selectedNode.type}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
              {selectedNode.summary || 'Entity participating in swarm interactions.'}
            </p>
          </div>
          <button 
            onClick={() => setSelectedNode(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
};
