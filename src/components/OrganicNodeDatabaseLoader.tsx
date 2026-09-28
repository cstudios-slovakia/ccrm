import React, { useEffect, useRef } from "react";

interface OrganicNodeDatabaseLoaderProps {
  size?: number;
  className?: string;
}

interface NodeData {
  id: number;
  tier: number; // 0 = root seed, 1 = primary entity, 2 = satellite data point
  angle: number; // angular position around center
  distance: number; // radial distance from center
  radius: number;
  color: string;
  glow: string;
  birthTime: number; // 0..1 in normalized cycle
  driftPhase: number;
  driftSpeed: number;
  driftAmp: number;
}

interface EdgeData {
  from: number;
  to: number;
  birthTime: number;
  pulsePhase: number;
  pulseSpeed: number;
}

const CYCLE_DURATION_MS = 6500; // 6.5s per full organic construction loop

// Beautiful bioluminescent node definitions
const NODES_CONFIG: Omit<NodeData, "driftPhase" | "driftSpeed" | "driftAmp">[] = [
  // Tier 0: Central Core Node (Root database engine)
  {
    id: 0,
    tier: 0,
    angle: 0,
    distance: 0,
    radius: 7.5,
    color: "#ffffff",
    glow: "#38bdf8",
    birthTime: 0.0
  },
  // Tier 1: Primary Entity Nodes (Clients, Projects, Finances, Automation, AI)
  {
    id: 1,
    tier: 1,
    angle: -Math.PI * 0.45,
    distance: 42,
    radius: 5.5,
    color: "#34d399", // Emerald
    glow: "#059669",
    birthTime: 0.15
  },
  {
    id: 2,
    tier: 1,
    angle: Math.PI * 0.15,
    distance: 45,
    radius: 5.2,
    color: "#60a5fa", // Sky Blue
    glow: "#2563eb",
    birthTime: 0.22
  },
  {
    id: 3,
    tier: 1,
    angle: Math.PI * 0.75,
    distance: 44,
    radius: 5.0,
    color: "#a78bfa", // Purple / AI
    glow: "#7c3aed",
    birthTime: 0.28
  },
  {
    id: 4,
    tier: 1,
    angle: Math.PI * 1.35,
    distance: 40,
    radius: 5.2,
    color: "#fbbf24", // Amber / Finances
    glow: "#d97706",
    birthTime: 0.35
  },
  // Tier 2: Satellite Leaf Nodes (Records, Relational Links, Synapses)
  {
    id: 5,
    tier: 2,
    angle: -Math.PI * 0.65,
    distance: 72,
    radius: 3.5,
    color: "#6ee7b7",
    glow: "#10b981",
    birthTime: 0.42
  },
  {
    id: 6,
    tier: 2,
    angle: -Math.PI * 0.25,
    distance: 68,
    radius: 3.2,
    color: "#93c5fd",
    glow: "#3b82f6",
    birthTime: 0.48
  },
  {
    id: 7,
    tier: 2,
    angle: Math.PI * 0.38,
    distance: 75,
    radius: 3.8,
    color: "#38bdf8",
    glow: "#0284c7",
    birthTime: 0.54
  },
  {
    id: 8,
    tier: 2,
    angle: Math.PI * 0.95,
    distance: 70,
    radius: 3.4,
    color: "#c084fc",
    glow: "#9333ea",
    birthTime: 0.58
  },
  {
    id: 9,
    tier: 2,
    angle: Math.PI * 1.15,
    distance: 74,
    radius: 3.6,
    color: "#f472b6",
    glow: "#db2777",
    birthTime: 0.62
  },
  {
    id: 10,
    tier: 2,
    angle: Math.PI * 1.55,
    distance: 73,
    radius: 3.5,
    color: "#fcd34d",
    glow: "#f59e0b",
    birthTime: 0.66
  }
];

const EDGES_CONFIG: EdgeData[] = [
  // Core to Tier 1
  { from: 0, to: 1, birthTime: 0.12, pulsePhase: 0.0, pulseSpeed: 1.4 },
  { from: 0, to: 2, birthTime: 0.18, pulsePhase: 0.3, pulseSpeed: 1.2 },
  { from: 0, to: 3, birthTime: 0.24, pulsePhase: 0.6, pulseSpeed: 1.5 },
  { from: 0, to: 4, birthTime: 0.30, pulsePhase: 0.1, pulseSpeed: 1.3 },
  // Tier 1 Ring Interconnections (Organic cluster loops)
  { from: 1, to: 2, birthTime: 0.38, pulsePhase: 0.4, pulseSpeed: 0.9 },
  { from: 2, to: 3, birthTime: 0.42, pulsePhase: 0.7, pulseSpeed: 1.1 },
  { from: 3, to: 4, birthTime: 0.46, pulsePhase: 0.2, pulseSpeed: 1.0 },
  { from: 4, to: 1, birthTime: 0.50, pulsePhase: 0.8, pulseSpeed: 1.2 },
  // Tier 1 to Tier 2 Satellites
  { from: 1, to: 5, birthTime: 0.45, pulsePhase: 0.5, pulseSpeed: 1.6 },
  { from: 1, to: 6, birthTime: 0.50, pulsePhase: 0.1, pulseSpeed: 1.4 },
  { from: 2, to: 7, birthTime: 0.56, pulsePhase: 0.8, pulseSpeed: 1.5 },
  { from: 3, to: 8, birthTime: 0.60, pulsePhase: 0.3, pulseSpeed: 1.3 },
  { from: 3, to: 9, birthTime: 0.64, pulsePhase: 0.9, pulseSpeed: 1.7 },
  { from: 4, to: 10, birthTime: 0.68, pulsePhase: 0.4, pulseSpeed: 1.5 },
  // Cross-satellite synapse bridging (mesh integrity)
  { from: 5, to: 6, birthTime: 0.72, pulsePhase: 0.2, pulseSpeed: 0.8 },
  { from: 8, to: 9, birthTime: 0.74, pulsePhase: 0.6, pulseSpeed: 0.8 }
];

export const OrganicNodeDatabaseLoader: React.FC<OrganicNodeDatabaseLoaderProps> = ({
  size = 140,
  className = ""
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const startTime = performance.now();

    // Initialize random drift parameters for natural biological floating
    const nodes: NodeData[] = NODES_CONFIG.map((n, i) => ({
      ...n,
      driftPhase: i * 1.37,
      driftSpeed: 0.6 + (i % 4) * 0.25,
      driftAmp: n.tier === 0 ? 1.2 : n.tier === 1 ? 2.8 : 3.8
    }));

    // Smooth easing functions
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    const render = (time: number) => {
      const elapsed = time - startTime;
      const cycleProgress = (elapsed % CYCLE_DURATION_MS) / CYCLE_DURATION_MS; // 0..1

      // High DPI crispness
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = size;
      const height = size;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const tSec = elapsed / 1000;

      // Organic global breath/pulse cycle
      const globalBreath = Math.sin(tSec * 1.8) * 0.05 + 1.0;

      // 1. Calculate active positions for each node with organic harmonic drift
      const currentPos: { x: number; y: number; scale: number; alpha: number }[] = [];

      nodes.forEach((node) => {
        // Node spawn progression
        const spawnDelay = node.birthTime;
        const spawnDuration = 0.18; // duration of sprouting bloom
        let nodeProgress = 0;

        if (cycleProgress < 0.88) {
          // Construction / Blooming phase
          if (cycleProgress >= spawnDelay) {
            nodeProgress = Math.min(1, (cycleProgress - spawnDelay) / spawnDuration);
          }
        } else {
          // Loop reset phase: graceful harmonic re-contraction
          const resetProgress = (cycleProgress - 0.88) / 0.12;
          const fadeDelay = (1 - node.tier * 0.3);
          nodeProgress = Math.max(0, 1 - resetProgress * fadeDelay);
        }

        const scale = node.tier === 0
          ? Math.max(0.7, easeOutBack(Math.min(1, cycleProgress / 0.15)))
          : easeOutBack(nodeProgress);

        const alpha = Math.min(1, nodeProgress * 1.2);

        // Organic harmonic floating drift
        const driftX = Math.sin(tSec * node.driftSpeed + node.driftPhase) * node.driftAmp;
        const driftY = Math.cos(tSec * (node.driftSpeed * 0.85) + node.driftPhase) * node.driftAmp;

        // Current distance influenced by global breath and sprout progression
        const dist = node.distance * globalBreath * (node.tier === 0 ? 1 : easeOutCubic(nodeProgress));
        const posX = centerX + Math.cos(node.angle) * dist + driftX;
        const posY = centerY + Math.sin(node.angle) * dist + driftY;

        currentPos.push({ x: posX, y: posY, scale, alpha });
      });

      // 2. Draw Database Central Ripple Waves (Sonar / Sync ripples emanating from Core)
      const rippleCount = 3;
      for (let r = 0; r < rippleCount; r++) {
        const ripplePhase = (cycleProgress * 2.2 + r / rippleCount) % 1.0;
        const rippleRadius = ripplePhase * (size * 0.44);
        const rippleAlpha = (1.0 - ripplePhase) * 0.25 * currentPos[0].alpha;

        if (rippleRadius > 4 && rippleAlpha > 0.01) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${rippleAlpha})`;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 3. Draw Connecting Synaptic Edges & Energy Pulses
      EDGES_CONFIG.forEach((edge) => {
        const p1 = currentPos[edge.from];
        const p2 = currentPos[edge.to];
        if (!p1 || !p2) return;

        // Edge visibility based on birthTime and connected nodes
        const edgeDelay = edge.birthTime;
        let edgeGrowth = 0;

        if (cycleProgress < 0.88) {
          if (cycleProgress >= edgeDelay) {
            edgeGrowth = Math.min(1, (cycleProgress - edgeDelay) / 0.14);
          }
        } else {
          const resetProgress = (cycleProgress - 0.88) / 0.12;
          edgeGrowth = Math.max(0, 1 - resetProgress * 1.5);
        }

        if (edgeGrowth <= 0 || p1.alpha <= 0.05 || p2.alpha <= 0.05) return;

        const easedGrowth = easeOutCubic(edgeGrowth);
        const targetX = p1.x + (p2.x - p1.x) * easedGrowth;
        const targetY = p1.y + (p2.y - p1.y) * easedGrowth;

        // Draw glowing connective line
        const edgeAlpha = Math.min(p1.alpha, p2.alpha) * 0.38 * edgeGrowth;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha * 0.75})`;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Edge ambient outer glow
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = `rgba(56, 189, 248, ${edgeAlpha * 0.4})`;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // 4. Draw Traveling Data Pulse Packets (synaptic data flowing between nodes)
        if (edgeGrowth >= 0.95) {
          const pulseT = (tSec * edge.pulseSpeed + edge.pulsePhase) % 1.0;
          const pulseX = p1.x + (p2.x - p1.x) * pulseT;
          const pulseY = p1.y + (p2.y - p1.y) * pulseT;
          const pulseBrightness = Math.sin(pulseT * Math.PI) * edgeAlpha * 2.5;

          if (pulseBrightness > 0.05) {
            // Pulse glow halo
            const pulseGlow = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, 4.5);
            pulseGlow.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, pulseBrightness)})`);
            pulseGlow.addColorStop(0.4, `rgba(56, 189, 248, ${Math.min(0.8, pulseBrightness * 0.7)})`);
            pulseGlow.addColorStop(1, "rgba(56, 189, 248, 0)");

            ctx.fillStyle = pulseGlow;
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 4.5, 0, Math.PI * 2);
            ctx.fill();

            // Pulse core
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // 5. Draw Glowing Nodes & Halos
      nodes.forEach((node, i) => {
        const pos = currentPos[i];
        if (!pos || pos.alpha <= 0.01 || pos.scale <= 0.01) return;

        const effectiveRadius = node.radius * pos.scale;
        const nodeGlowRadius = effectiveRadius * 2.8;

        // Outer ambient glow
        const glowGrad = ctx.createRadialGradient(
          pos.x,
          pos.y,
          effectiveRadius * 0.3,
          pos.x,
          pos.y,
          nodeGlowRadius
        );
        glowGrad.addColorStop(0, node.color + "99");
        glowGrad.addColorStop(0.5, node.glow + "44");
        glowGrad.addColorStop(1, "transparent");

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Node Body
        const bodyGrad = ctx.createRadialGradient(
          pos.x - effectiveRadius * 0.3,
          pos.y - effectiveRadius * 0.3,
          0,
          pos.x,
          pos.y,
          effectiveRadius
        );
        bodyGrad.addColorStop(0, "#ffffff");
        bodyGrad.addColorStop(0.5, node.color);
        bodyGrad.addColorStop(1, node.glow);

        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, effectiveRadius, 0, Math.PI * 2);
        ctx.fill();

        // Node Specular Ring / Core Highlight
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, effectiveRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Central Root Node Extra Energy Flare
        if (node.tier === 0) {
          const corePulse = Math.sin(tSec * 3.2) * 0.2 + 0.8;
          ctx.fillStyle = `rgba(255, 255, 255, ${corePulse * 0.9})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2.8 * pos.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [size]);

  return (
    <div
      className={`relative flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block"
      />
    </div>
  );
};
