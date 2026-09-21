import React, { useMemo } from "react";
import { Blobatar } from "@blobatar/react";
import {
  idle,
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking,
  type Expression
} from "blobatar/expression";

export type ExpressionName =
  | "idle"
  | "happy"
  | "sad"
  | "mad"
  | "surprised"
  | "wink"
  | "sleepy"
  | "smug"
  | "unsure"
  | "scared"
  | "love"
  | "shy"
  | "sick"
  | "thinking";

const EXPRESSION_MAP: Record<ExpressionName, Expression> = {
  idle,
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking
};

export const ROLE_CONTAINER_THEMES: Record<
  string,
  {
    bg: string;
    border: string;
    shadow: string;
  }
> = {
  purple: {
    bg: "bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 text-white",
    border: "border-purple-400/40",
    shadow: "shadow-sm shadow-purple-600/25"
  },
  emerald: {
    bg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-800 text-white",
    border: "border-emerald-400/40",
    shadow: "shadow-sm shadow-emerald-600/25"
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 text-white",
    border: "border-amber-400/40",
    shadow: "shadow-sm shadow-amber-600/25"
  },
  rose: {
    bg: "bg-gradient-to-br from-rose-500 via-pink-600 to-rose-800 text-white",
    border: "border-rose-400/40",
    shadow: "shadow-sm shadow-rose-600/25"
  },
  slate: {
    bg: "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900 text-white",
    border: "border-slate-500/40",
    shadow: "shadow-sm shadow-slate-700/25"
  },
  cyan: {
    bg: "bg-gradient-to-br from-cyan-500 via-teal-600 to-blue-700 text-white",
    border: "border-cyan-400/40",
    shadow: "shadow-sm shadow-cyan-600/25"
  },
  orange: {
    bg: "bg-gradient-to-br from-orange-500 via-amber-600 to-red-700 text-white",
    border: "border-orange-400/40",
    shadow: "shadow-sm shadow-orange-600/25"
  },
  indigo: {
    bg: "bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-800 text-white",
    border: "border-indigo-400/40",
    shadow: "shadow-sm shadow-indigo-600/25"
  },
  blue: {
    bg: "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-800 text-white",
    border: "border-blue-400/40",
    shadow: "shadow-sm shadow-blue-600/25"
  },
  council: {
    bg: "bg-gradient-to-br from-amber-500 via-orange-600 to-purple-800 text-white",
    border: "border-amber-400/50",
    shadow: "shadow-sm shadow-amber-600/30"
  },
  gold: {
    bg: "bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-700 text-white",
    border: "border-amber-300/50",
    shadow: "shadow-sm shadow-amber-600/30"
  }
};

export interface BlobatarAvatarProps {
  name: string;
  size?: number;
  className?: string;
  animate?: "hover" | "always" | false;
  expression?: Expression | ExpressionName;
  title?: string;
  rounded?: "md" | "lg" | "xl" | "2xl" | "full" | "none";
  badge?: React.ReactNode;
  roleColor?: string;
  background?: boolean | "square" | "circle" | "squircle";
  frameless?: boolean;
}

export const BlobatarAvatar: React.FC<BlobatarAvatarProps> = ({
  name,
  size = 32,
  className = "",
  animate = "hover",
  expression,
  title,
  rounded = "xl",
  badge,
  roleColor,
  background,
  frameless = false
}) => {
  const roundedClass = frameless
    ? ""
    : rounded === "full"
      ? "rounded-full"
      : rounded === "2xl"
        ? "rounded-2xl"
        : rounded === "lg"
          ? "rounded-lg"
          : rounded === "md"
            ? "rounded-md"
            : rounded === "none"
              ? ""
              : "rounded-xl";

  const seed = (name || "CRM").trim();

  const resolvedExpression = useMemo(() => {
    if (!expression) return undefined;
    if (typeof expression === "string") {
      return EXPRESSION_MAP[expression] || undefined;
    }
    return expression;
  }, [expression]);

  // When expression is active (e.g. thinking), default to "always" animation for continuous morphing
  const effectiveAnimate: "hover" | "always" | undefined =
    animate === false
      ? undefined
      : resolvedExpression
        ? (animate === "hover" ? "hover" : "always")
        : (animate === "always" ? "always" : "hover");

  const theme = !frameless && roleColor ? (ROLE_CONTAINER_THEMES[roleColor] || ROLE_CONTAINER_THEMES.purple) : null;
  const containerBgClass = frameless
    ? "bg-transparent border-0 shadow-none"
    : theme
      ? `${theme.bg} ${theme.border} ${theme.shadow} border`
      : "shadow-xs border border-slate-900/10";

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${roundedClass} ${frameless ? "overflow-visible" : "overflow-hidden"} ${containerBgClass} transition-all duration-200 ${className}`}
      style={{ width: size, height: size }}
      title={title || seed}
    >
      <Blobatar
        name={seed}
        size={size}
        background={frameless ? false : (background ?? (theme ? false : undefined))}
        animate={effectiveAnimate}
        expression={resolvedExpression}
        title={title || seed}
        className="w-full h-full object-contain p-0 block transition-all duration-300"
      />
      {badge && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10">
          {badge}
        </div>
      )}
    </div>
  );
};

