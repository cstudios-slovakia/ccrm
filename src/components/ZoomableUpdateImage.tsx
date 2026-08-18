import React, { useEffect } from "react";
import { ZoomIn } from "lucide-react";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

export const useUpdateFancybox = (
  containerRef: React.RefObject<HTMLElement | null>,
  activeUpdateId?: string,
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    Fancybox.bind(container, "[data-fancybox]", {});
    return () => Fancybox.unbind(container, "[data-fancybox]");
  }, [containerRef, activeUpdateId]);
};

interface ZoomableUpdateImageProps {
  src: string;
  alt: string;
  group: string;
  caption?: string;
  openLabel: string;
  className?: string;
  imageClassName?: string;
}

export const ZoomableUpdateImage: React.FC<ZoomableUpdateImageProps> = ({
  src,
  alt,
  group,
  caption,
  openLabel,
  className = "",
  imageClassName = "",
}) => (
  <a
    href={src}
    data-fancybox={group}
    data-caption={caption || alt}
    className={`group relative block cursor-zoom-in overflow-hidden rounded-2xl bg-slate-50 outline-none transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 active:translate-y-0 ${className}`}
    aria-label={`${openLabel}: ${alt}`}
  >
    <img src={src} alt={alt} className={`w-full object-contain ${imageClassName}`} />
    <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1.5 text-[10px] font-bold text-white opacity-0 shadow-lg backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
      <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
      {openLabel}
    </span>
  </a>
);
