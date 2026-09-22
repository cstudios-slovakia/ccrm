import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Bot } from "lucide-react";
import { BlobatarAvatar } from "../common/BlobatarAvatar";
import { VERSION_CODENAME } from "../../utils/version";
import type { Language } from "../../utils/translations";

export type CopilotCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

interface FloatingCopilotOrbProps {
  isOpen: boolean;
  onOpen: () => void;
  systemLanguage?: Language;
  screenTitle?: string;
  corner: CopilotCorner;
  onCornerChange: (corner: CopilotCorner) => void;
}

const CORNER_COORDINATES = (w: number, h: number, orbSize = 64, pad = 24) => {
  const isMobile = w < 1024;
  const bottomPad = isMobile ? pad + 64 : pad + 20;
  return {
    "top-left": { x: pad, y: pad + 10 },
    "top-right": { x: Math.max(pad, w - orbSize - pad), y: pad + 10 },
    "bottom-left": { x: pad, y: Math.max(pad, h - orbSize - bottomPad) },
    "bottom-right": { x: Math.max(pad, w - orbSize - pad), y: Math.max(pad, h - orbSize - bottomPad) }
  };
};

export const FloatingCopilotOrb: React.FC<FloatingCopilotOrbProps> = ({
  isOpen,
  onOpen,
  systemLanguage = "sk",
  screenTitle,
  corner,
  onCornerChange
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasPositioned, setHasPositioned] = useState(false);

  const orbRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number; hasMoved: boolean }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
    hasMoved: false
  });

  // Position recalculation when window resizes or corner changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateToCorner = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const coords = CORNER_COORDINATES(w, h);
      setPos(coords[corner]);
      setHasPositioned(true);
    };

    updateToCorner();
    window.addEventListener("resize", updateToCorner);
    return () => window.removeEventListener("resize", updateToCorner);
  }, [corner]);

  // Pointer drag events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left click / single touch
    if (e.button !== 0) return;
    
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pos.x,
      initY: pos.y,
      hasMoved: false
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragStartRef.current.hasMoved = true;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const orbSize = 64;
    const pad = 12;
    const isMobile = w < 1024;
    const bottomPad = isMobile ? 76 : 12;

    const nextX = Math.max(pad, Math.min(w - orbSize - pad, dragStartRef.current.initX + dx));
    const nextY = Math.max(pad, Math.min(h - orbSize - bottomPad, dragStartRef.current.initY + dy));

    setPos({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    // If it was a quick click rather than a drag, trigger open
    if (!dragStartRef.current.hasMoved) {
      onOpen();
      return;
    }

    // Determine nearest corner
    const w = window.innerWidth;
    const h = window.innerHeight;
    const coords = CORNER_COORDINATES(w, h);

    let closestCorner: CopilotCorner = "bottom-right";
    let minDistance = Infinity;

    (Object.keys(coords) as CopilotCorner[]).forEach((cKey) => {
      const cPos = coords[cKey];
      const dist = Math.hypot(pos.x - cPos.x, pos.y - cPos.y);
      if (dist < minDistance) {
        minDistance = dist;
        closestCorner = cKey;
      }
    });

    onCornerChange(closestCorner);
    setPos(coords[closestCorner]);
  };

  if (isOpen || !hasPositioned) {
    return null;
  }

  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const isLeft = corner.includes("left");
  const isTop = corner.includes("top");

  return (
    <div
      ref={orbRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setIsDragging(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        touchAction: "none"
      }}
      className={`fixed top-0 left-0 z-[9990] select-none cursor-grab active:cursor-grabbing transition-transform ${
        isDragging ? "duration-0 scale-105" : "duration-300 ease-out"
      }`}
      role="button"
      tabIndex={0}
      aria-label="Open AI Executive Copilot"
    >
      <div className="relative group">
        {/* Ambient Pulsing Halo */}
        <div className="absolute -inset-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-500 rounded-full blur-md opacity-40 group-hover:opacity-75 animate-pulse transition-opacity duration-500" />

        {/* Main Floating Orb Avatar Container */}
        <div className="relative w-16 h-16 rounded-full bg-slate-900 border-2 border-white/90 shadow-2xl flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 transition-transform duration-200">
          <BlobatarAvatar
            name={`Executive Leader (${VERSION_CODENAME})`}
            roleColor="purple"
            size={60}
            animate="always"
            expression={isHovered ? "wink" : isDragging ? "surprised" : "idle"}
            frameless
          />

          {/* Glowing AI Mini Badge */}
          <div className="absolute -bottom-0.5 -right-0.5 bg-gradient-to-r from-amber-400 to-purple-600 text-white rounded-full p-1 shadow-md border-2 border-white">
            <Sparkles className="h-3 w-3 animate-spin-slow" />
          </div>
        </div>

        {/* Tooltip on Hover */}
        <div
          className={`absolute pointer-events-none whitespace-nowrap transition-all duration-200 z-50 ${
            isHovered && !isDragging ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible"
          } ${
            isTop
              ? "top-full mt-2.5"
              : "bottom-full mb-2.5"
          } ${
            isLeft
              ? "left-0"
              : "right-0"
          }`}
        >
          <div className="bg-slate-900/95 text-white backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-slate-700/60 text-xs flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-400 shrink-0" />
            <div>
              <p className="font-bold text-[11px] leading-tight">
                {t("Executive Copilot", "Výkonný AI Copilot", "Vezetői AI Copilot")}
                {screenTitle && <span className="ml-1 text-slate-300 font-normal">({screenTitle})</span>}
                <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-300 font-extrabold uppercase">
                  {VERSION_CODENAME}
                </span>
              </p>
              <p className="text-[9.5px] text-slate-400 mt-0.5">
                {t("Click to chat • Drag to reposition", "Kliknutím otvoríte • Presuňte potiahnutím", "Kattintson a chathez • Húzással mozgatható")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
