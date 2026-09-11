import React, { useRef, useState } from 'react';
import type { SwarmKnowledgeGraph, SwarmEntityNode } from '../../utils/swarm/types';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

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

  const selectedPos = selectedNode ? nodePositions.get(selectedNode.id) : null;
  const connectedEdges = selectedNode ? graph.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id) : [];

  const POPOVER_WIDTH = 260;
  const POPOVER_HEIGHT = 120;

  const isAbove = selectedPos ? selectedPos.y >= 125 : true;
  const popoverX = selectedPos ? Math.max(10, Math.min(600 - POPOVER_WIDTH - 10, selectedPos.x - POPOVER_WIDTH / 2)) : 0;
  const popoverY = selectedPos ? (isAbove ? selectedPos.y - POPOVER_HEIGHT - 20 : selectedPos.y + 36) : 0;
  const arrowBaseX = selectedPos ? Math.max(popoverX + 20, Math.min(popoverX + POPOVER_WIDTH - 20, selectedPos.x)) : 0;
  const arrowPoints = selectedPos ? (isAbove
    ? `${arrowBaseX - 8},${popoverY + POPOVER_HEIGHT} ${arrowBaseX + 8},${popoverY + POPOVER_HEIGHT} ${selectedPos.x},${selectedPos.y - 18}`
    : `${arrowBaseX - 8},${popoverY} ${arrowBaseX + 8},${popoverY} ${selectedPos.x},${selectedPos.y + 32}`) : '';

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
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.6))}
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoomLevel(1)}
          className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition cursor-pointer"
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
          <rect 
            width="100%" 
            height="100%" 
            fill="url(#graph-grid)" 
            onClick={() => setSelectedNode(null)}
            className="cursor-default"
          />

          {/* Edges */}
          <g className="edges">
            {graph.edges.map((edge) => {
              const src = nodePositions.get(edge.source);
              const tgt = nodePositions.get(edge.target);
              if (!src || !tgt) return null;

              const isEdgeConnected = selectedNode 
                ? (edge.source === selectedNode.id || edge.target === selectedNode.id)
                : false;

              return (
                <g 
                  key={edge.id} 
                  className={`transition-opacity ${
                    selectedNode 
                      ? (isEdgeConnected ? 'opacity-100' : 'opacity-20') 
                      : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  <line 
                    x1={src.x} 
                    y1={src.y} 
                    x2={tgt.x} 
                    y2={tgt.y} 
                    stroke={isEdgeConnected && selectedPos ? selectedPos.color : "#475569"} 
                    strokeWidth={isEdgeConnected ? "2.5" : "1.5"}
                    strokeDasharray={edge.invalidFromRound ? "4 4" : undefined}
                  />
                  <text 
                    x={(src.x + tgt.x) / 2} 
                    y={(src.y + tgt.y) / 2 - 4} 
                    fill={isEdgeConnected ? "#f1f5f9" : "#94a3b8"} 
                    fontSize={isEdgeConnected ? "8.5" : "8"} 
                    fontWeight={isEdgeConnected ? "bold" : "normal"}
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
              const isNeighbor = selectedNode && connectedEdges.some(e => e.source === node.id || e.target === node.id);

              return (
                <g 
                  key={node.id} 
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(prev => prev?.id === node.id ? null : node);
                  }}
                  className={`cursor-pointer group transition-opacity duration-200 ${
                    selectedNode && !isSelected && !isNeighbor ? 'opacity-40 hover:opacity-90' : 'opacity-100'
                  }`}
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
                    fill={isSelected ? '#ffffff' : '#e2e8f0'} 
                    fontSize={isSelected ? "10.5" : "9.5"} 
                    fontWeight={isSelected ? "bold" : "600"}
                    textAnchor="middle" 
                    className="select-none font-sans drop-shadow-md pointer-events-none"
                  >
                    {node.name.length > 18 ? node.name.slice(0, 16) + '…' : node.name}
                  </text>
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
                fill="#0f172a"
                stroke={selectedPos.color}
                strokeWidth="1.5"
                className="drop-shadow-lg"
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
                  className="w-full h-full bg-slate-900/95 border border-slate-700/90 rounded-2xl p-3 shadow-2xl text-white flex flex-col justify-between select-none backdrop-blur-md"
                  style={{ 
                    borderColor: `${selectedPos.color}90`, 
                    boxShadow: `0 10px 25px -5px ${selectedPos.color}35, 0 8px 10px -6px ${selectedPos.color}35` 
                  }}
                >
                  {/* Popover Header */}
                  <div className="flex items-start justify-between gap-1 border-b border-slate-800 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: selectedPos.color }}
                      />
                      <span className="text-xs font-bold text-white truncate max-w-[140px]" title={selectedNode.name}>
                        {selectedNode.name}
                      </span>
                      <span 
                        className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider border shrink-0"
                        style={{ 
                          backgroundColor: `${selectedPos.color}20`, 
                          color: selectedPos.color,
                          borderColor: `${selectedPos.color}50`
                        }}
                      >
                        {selectedNode.type}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(null);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0 -mt-0.5 -mr-0.5"
                      title="Close explanation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Popover Explanation */}
                  <div className="flex-1 py-1 overflow-hidden">
                    <p className="text-[10.5px] text-slate-300 leading-snug line-clamp-3 font-normal">
                      {selectedNode.summary || 'Simulated entity participating in social market interactions and feedback.'}
                    </p>
                  </div>

                  {/* Popover Footer Relations */}
                  {connectedEdges.length > 0 && (
                    <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[9.5px] text-slate-400">
                      <span className="font-medium text-slate-400">Relation:</span>
                      <span className="font-mono text-indigo-300 font-bold truncate max-w-[160px]">
                        {connectedEdges[0].relation} → {
                          connectedEdges[0].source === selectedNode.id 
                            ? (graph.nodes.find(n => n.id === connectedEdges[0].target)?.name || 'Entity')
                            : (graph.nodes.find(n => n.id === connectedEdges[0].source)?.name || 'Entity')
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
