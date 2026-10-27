import React from "react";

interface FlockIconProps {
  className?: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

/**
 * SAI's flock mark, drawn as three birds in formation.
 * Same 2px round stroke as the Lucide icons, painted with currentColor.
 */
export const FlockIcon: React.FC<FlockIconProps> = ({
  className = "w-5 h-5",
  color,
  style,
  strokeWidth = 2,
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke={color || "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M12 3.5 8.7 8" />
      <path d="M12 3.5 15.3 8" />
      <path d="M6.8 10.2 4 14.4" />
      <path d="M6.8 10.2 9.6 14.4" />
      <path d="M17.2 10.2 14.4 14.4" />
      <path d="M17.2 10.2 20 14.4" />
    </svg>
  );
};

export default FlockIcon;
