import React from "react";
import { Blobatar } from "@blobatar/react";

export interface BlobatarAvatarProps {
  name: string;
  size?: number;
  className?: string;
  animate?: "hover" | "always";
  title?: string;
  rounded?: "md" | "lg" | "xl" | "2xl" | "full";
  badge?: React.ReactNode;
}

export const BlobatarAvatar: React.FC<BlobatarAvatarProps> = ({
  name,
  size = 32,
  className = "",
  animate = "hover",
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

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${roundedClass} overflow-hidden shadow-xs border border-slate-900/10 transition-transform duration-200 ${className}`}
      style={{ width: size, height: size }}
      title={title || seed}
    >
      <Blobatar
        name={seed}
        size={size}
        animate={animate}
        title={title || seed}
        className="w-full h-full object-cover block"
      />
      {badge && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10">
          {badge}
        </div>
      )}
    </div>
  );
};
