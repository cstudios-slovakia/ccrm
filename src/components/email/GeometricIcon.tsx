import React from "react";

// Geometric Icon component from AuroraMail
export const GeometricIcon: React.FC<{ emailString?: string }> = ({ emailString }) => {
  if (!emailString) return null;
  let hash = 0;
  for (let i = 0; i < emailString.length; i++) {
    hash = emailString.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const hue = hash % 360;
  const color = `hsl(${hue}, 70%, 60%)`;
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
  const shape = shapes[hash % shapes.length];

  return (
    <svg width="12" height="12" viewBox="0 0 20 20" style={{ marginRight: '6px', flexShrink: 0 }}>
      {shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
      {shape === 'square' && <rect x="2" y="2" width="16" height="16" rx="4" fill={color} />}
      {shape === 'triangle' && <polygon points="10,2 18,18 2,18" fill={color} strokeLinejoin="round" />}
      {shape === 'diamond' && <polygon points="10,2 18,10 10,18 2,10" fill={color} />}
      {shape === 'hexagon' && <polygon points="10,1 18,5 18,15 10,19 2,15 2,5" fill={color} />}
    </svg>
  );
};
