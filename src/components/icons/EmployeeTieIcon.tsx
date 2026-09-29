import React from "react";

interface EmployeeTieIconProps {
  className?: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export const EmployeeTieIcon: React.FC<EmployeeTieIconProps> = ({
  className = "w-5 h-5",
  size = 20,
  color,
  style
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {/* Background/colleague person silhouette (left) */}
      <circle cx="6" cy="6" r="2.5" />
      <path d="M2.5 17c0-2.8 2-4.5 4.5-4.5 1 0 2 .3 2.7.9" />

      {/* Background/colleague person silhouette (right) */}
      <circle cx="18" cy="6" r="2.5" />
      <path d="M14.3 13.4c.7-.6 1.7-.9 2.7-.9 2.5 0 4.5 1.7 4.5 4.5" />

      {/* Main / foreground person (center) */}
      <circle cx="12" cy="7" r="3" />
      {/* Shoulders */}
      <path d="M7 21v-2c0-2.8 2.2-5 5-5s5 2.2 5 5v2" />

      {/* Tie detail on foreground person */}
      <path d="M11 14.5l1 1 1-1" />
      <path d="M11.5 15.5l-.5 4 1 1.5 1-1.5-.5-4z" fill={color || "currentColor"} fillOpacity="0.25" />
    </svg>
  );
};

export default EmployeeTieIcon;
