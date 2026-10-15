import React, { useState } from "react";

interface ShanShuiBackgroundProps {
  className?: string;
}

/**
 * Procedural Chinese landscape painting (山水画) infinite scrolling background.
 * Powered by LingDong-/shan-shui-inf procedural generation engine.
 * Generates mountains, trees, pagodas, boats, and water on textured rice paper,
 * drifting infinitely and smoothly from right to left.
 */
export const ShanShuiBackground: React.FC<ShanShuiBackgroundProps> = ({ className = "" }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none bg-[#f5f0e6] z-0 ${className}`}
      aria-hidden="true"
    >
      {/* Shan Shui Procedural Generation Iframe */}
      <iframe
        title="Shan Shui Infinite Scroll"
        src="/shanshui.html"
        tabIndex={-1}
        className={`absolute inset-0 w-full h-full border-0 pointer-events-none select-none transition-opacity duration-1000 ease-out ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setIsLoaded(true)}
      />

      {/* Atmospheric Antique Parchment Vignette Overlay. Plain alpha, no
          mix-blend-mode: a blend mode makes the browser re-blend the whole
          animated iframe underneath on every frame. */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(245, 240, 230, 0.1) 40%, rgba(70, 55, 35, 0.12) 100%)"
        }}
      />
    </div>
  );
};
