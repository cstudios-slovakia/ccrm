import React from 'react';

interface FlockIconProps {
  className?: string;
  size?: number;
  gradientId?: string;
  color?: string;
}

export const FlockIcon: React.FC<FlockIconProps> = ({ 
  className = "w-5 h-5", 
  size = 20,
  gradientId = "flock-grad",
  color
}) => {
  const isWhite = color === 'white' || color === '#ffffff' || className.includes('text-white');
  const fillSource = isWhite ? 'currentColor' : `url(#${gradientId})`;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9333ea" /> {/* Purple-600 */}
          <stop offset="50%" stopColor="#6366f1" /> {/* Indigo-500 */}
          <stop offset="100%" stopColor="#10b981" /> {/* Emerald-500 */}
        </linearGradient>
      </defs>

      {/* Leader Bird */}
      <path 
        d="M12 3C10.5 5 8 5.8 7 6C8.5 7 11.5 7.5 12 9C12.5 7.5 15.5 7 17 6C16 5.8 13.5 5 12 3Z" 
        fill={fillSource} 
      />

      {/* Left Flank Birds */}
      <path 
        d="M6 10C4.8 11.5 3 12.2 2 12.5C3.2 13.2 5.5 13.5 6 15C6.5 13.5 8.8 13.2 10 12.5C9 12.2 7.2 11.5 6 10Z" 
        fill={fillSource} 
        opacity="0.85"
      />
      <path 
        d="M2.5 17C1.8 18 0.5 18.5 0 18.7C0.8 19.2 2.2 19.5 2.5 20.5C2.8 19.5 4.2 19.2 5 18.7C4.5 18.5 3.2 18 2.5 17Z" 
        fill={fillSource} 
        opacity="0.65"
      />

      {/* Right Flank Birds */}
      <path 
        d="M18 10C16.8 11.5 15 12.2 14 12.5C15.2 13.2 17.5 13.5 18 15C18.5 13.5 20.8 13.2 22 12.5C21 12.2 19.2 11.5 18 10Z" 
        fill={fillSource} 
        opacity="0.85"
      />
      <path 
        d="M21.5 17C20.8 18 19.5 18.5 19 18.7C19.8 19.2 21.2 19.5 21.5 20.5C21.8 19.5 23.2 19.2 24 18.7C23.5 18.5 22.2 18 21.5 17Z" 
        fill={fillSource} 
        opacity="0.65"
      />
    </svg>
  );
};

export default FlockIcon;
