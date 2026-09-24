import React, { useMemo } from "react";
import type { CustomDashboard, UnifiedEntryRegistry } from "../../types";

interface AuroraBackgroundProps {
  activeTab: string;
  customDashboards?: CustomDashboard[];
  unifiedEntries?: UnifiedEntryRegistry[];
  className?: string;
}

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
}

const TAB_COLOR_MAP: Record<string, ThemeColors> = {
  dashboard: {
    primary: "rgba(99, 102, 241, 0.25)", // Indigo
    secondary: "rgba(6, 182, 212, 0.20)", // Cyan / Sky
    accent: "rgba(16, 185, 129, 0.18)", // Emerald
  },
  tasks: {
    primary: "rgba(255, 93, 0, 0.28)", // Flame / Bright Orange
    secondary: "rgba(245, 158, 11, 0.22)", // Amber / Gold
    accent: "rgba(244, 63, 94, 0.18)", // Rose
  },
  overview: {
    primary: "rgba(8, 145, 178, 0.25)", // Cyan
    secondary: "rgba(2, 132, 199, 0.20)", // Sky
    accent: "rgba(99, 102, 241, 0.16)", // Indigo
  },
  projects: {
    primary: "rgba(139, 92, 246, 0.26)", // Purple / Lavender
    secondary: "rgba(99, 102, 241, 0.20)", // Indigo
    accent: "rgba(217, 70, 239, 0.18)", // Fuchsia
  },
  rag_ai: {
    primary: "rgba(124, 58, 237, 0.28)", // Violet
    secondary: "rgba(192, 38, 211, 0.20)", // Fuchsia
    accent: "rgba(99, 102, 241, 0.18)", // Indigo
  },
  sai: {
    primary: "rgba(139, 92, 246, 0.25)", // Purple
    secondary: "rgba(16, 185, 129, 0.22)", // Emerald
    accent: "rgba(6, 182, 212, 0.18)", // Cyan
  },
  leads: {
    primary: "rgba(37, 99, 235, 0.26)", // Blue
    secondary: "rgba(14, 165, 233, 0.20)", // Sky
    accent: "rgba(79, 70, 229, 0.18)", // Indigo
  },
  clients: {
    primary: "rgba(5, 150, 105, 0.26)", // Emerald
    secondary: "rgba(13, 148, 136, 0.20)", // Teal
    accent: "rgba(52, 211, 153, 0.18)", // Mint
  },
  invoices: {
    primary: "rgba(99, 102, 241, 0.26)", // Indigo
    secondary: "rgba(37, 99, 235, 0.20)", // Blue
    accent: "rgba(124, 58, 237, 0.18)", // Violet
  },
  warehouse: {
    primary: "rgba(30, 58, 138, 0.26)", // Navy
    secondary: "rgba(59, 130, 246, 0.20)", // Blue
    accent: "rgba(2, 132, 199, 0.18)", // Sky
  },
  financial: {
    primary: "rgba(16, 185, 129, 0.26)", // Emerald
    secondary: "rgba(15, 118, 110, 0.20)", // Teal
    accent: "rgba(22, 163, 74, 0.18)", // Green
  },
  meetings: {
    primary: "rgba(79, 70, 229, 0.26)", // Indigo
    secondary: "rgba(2, 132, 199, 0.20)", // Sky
    accent: "rgba(99, 102, 241, 0.18)", // Violet
  },
  files: {
    primary: "rgba(217, 119, 6, 0.26)", // Amber
    secondary: "rgba(234, 88, 12, 0.20)", // Orange
    accent: "rgba(234, 179, 8, 0.18)", // Gold
  },
  email: {
    primary: "rgba(219, 39, 119, 0.26)", // Pink
    secondary: "rgba(192, 38, 211, 0.20)", // Fuchsia
    accent: "rgba(244, 63, 94, 0.18)", // Rose
  },
  automation: {
    primary: "rgba(107, 33, 168, 0.26)", // Deep Purple
    secondary: "rgba(124, 58, 237, 0.20)", // Violet
    accent: "rgba(192, 38, 211, 0.18)", // Fuchsia
  },
  social_media: {
    primary: "rgba(225, 29, 72, 0.26)", // Rose
    secondary: "rgba(236, 72, 153, 0.20)", // Pink
    accent: "rgba(245, 158, 11, 0.18)", // Amber
  },
  updates: {
    primary: "rgba(217, 119, 6, 0.26)", // Amber
    secondary: "rgba(234, 88, 12, 0.20)", // Orange
    accent: "rgba(139, 92, 246, 0.18)", // Purple
  },
  settings: {
    primary: "rgba(100, 116, 139, 0.22)", // Slate
    secondary: "rgba(79, 70, 229, 0.18)", // Indigo
    accent: "rgba(59, 130, 246, 0.16)", // Blue
  },
  "personal-settings": {
    primary: "rgba(79, 70, 229, 0.24)", // Indigo
    secondary: "rgba(14, 165, 233, 0.18)", // Sky
    accent: "rgba(100, 116, 139, 0.16)", // Slate
  },
};

/** Convert hex to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(99, 102, 241, ${alpha})`;
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return `rgba(99, 102, 241, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  activeTab,
  customDashboards = [],
  unifiedEntries = [],
  className = "",
}) => {
  const colors = useMemo<ThemeColors>(() => {
    const rawTab = (activeTab || "dashboard").toLowerCase();
    const baseTab = rawTab.split(/[/?]/)[0];

    // Check direct tab map
    if (TAB_COLOR_MAP[baseTab]) {
      return TAB_COLOR_MAP[baseTab];
    }

    // Check custom dashboards
    const customDash = customDashboards.find(
      (d) => d.id === baseTab || `dashboard-${d.id}` === baseTab
    );
    if (customDash?.color) {
      return {
        primary: hexToRgba(customDash.color, 0.26),
        secondary: hexToRgba(customDash.color, 0.16),
        accent: "rgba(99, 102, 241, 0.15)",
      };
    }

    // Check custom unified entries
    const customUe = unifiedEntries.find(
      (ue) => ue.id === baseTab || `ue-${ue.id}` === baseTab
    );
    if (customUe?.color) {
      return {
        primary: hexToRgba(customUe.color, 0.26),
        secondary: hexToRgba(customUe.color, 0.16),
        accent: "rgba(16, 185, 129, 0.15)",
      };
    }

    // Fallback based on startsWith
    for (const key of Object.keys(TAB_COLOR_MAP)) {
      if (baseTab.startsWith(key)) {
        return TAB_COLOR_MAP[key];
      }
    }

    return TAB_COLOR_MAP.dashboard;
  }, [activeTab, customDashboards, unifiedEntries]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      {/* Aurora Ambient Blob 1 (Top Left / Upper Canvas) */}
      <div
        className="absolute -top-[12%] -left-[10%] w-[580px] h-[580px] md:w-[800px] md:h-[800px] rounded-full blur-[110px] md:blur-[140px] opacity-90 transition-all duration-1000 ease-out will-change-transform animate-aurora-pulse-1"
        style={{
          background: `radial-gradient(circle at center, ${colors.primary} 0%, ${colors.secondary} 45%, transparent 75%)`,
        }}
      />

      {/* Aurora Ambient Blob 2 (Top Right / Middle Right Canvas) */}
      <div
        className="absolute top-[8%] -right-[12%] w-[500px] h-[500px] md:w-[720px] md:h-[720px] rounded-full blur-[110px] md:blur-[140px] opacity-80 transition-all duration-1000 ease-out will-change-transform animate-aurora-pulse-2"
        style={{
          background: `radial-gradient(circle at center, ${colors.secondary} 0%, ${colors.accent} 50%, transparent 75%)`,
        }}
      />

      {/* Aurora Ambient Blob 3 (Bottom Center / Left subtle glow) */}
      <div
        className="absolute -bottom-[15%] left-[20%] w-[450px] h-[450px] md:w-[650px] md:h-[650px] rounded-full blur-[120px] md:blur-[150px] opacity-70 transition-all duration-1000 ease-out will-change-transform animate-aurora-pulse-3"
        style={{
          background: `radial-gradient(circle at center, ${colors.accent} 0%, ${colors.primary} 45%, transparent 75%)`,
        }}
      />
    </div>
  );
};
