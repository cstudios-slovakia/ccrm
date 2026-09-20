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

export interface BlobatarAvatarProps {
  name: string;
  size?: number;
  className?: string;
  animate?: "hover" | "always" | false;
  expression?: Expression | ExpressionName;
  title?: string;
  rounded?: "md" | "lg" | "xl" | "2xl" | "full";
  badge?: React.ReactNode;
}

export const BlobatarAvatar: React.FC<BlobatarAvatarProps> = ({
  name,
  size = 32,
  className = "",
  animate = "hover",
  expression,
  title,
  rounded = "xl",
  badge
}) => {
  const roundedClass =
    rounded === "full"
      ? "rounded-full"
      : rounded === "2xl"
        ? "rounded-2xl"
        : rounded === "lg"
          ? "rounded-lg"
          : rounded === "md"
            ? "rounded-md"
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

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${roundedClass} overflow-hidden shadow-xs border border-slate-900/10 transition-all duration-200 ${className}`}
      style={{ width: size, height: size }}
      title={title || seed}
    >
      <Blobatar
        name={seed}
        size={size}
        animate={effectiveAnimate}
        expression={resolvedExpression}
        title={title || seed}
        className="w-full h-full object-cover block transition-all duration-300"
      />
      {badge && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10">
          {badge}
        </div>
      )}
    </div>
  );
};

