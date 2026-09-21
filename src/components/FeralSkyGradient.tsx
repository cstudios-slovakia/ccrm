import React from "react";
import { FeralGradientBackground } from "./FeralGradientBackground";

export interface FeralSkyGradientProps {
  className?: string;
}

export const FeralSkyGradient: React.FC<FeralSkyGradientProps> = ({ className }) => {
  return <FeralGradientBackground phaseId="day" className={className} />;
};

export { FeralGradientBackground };
