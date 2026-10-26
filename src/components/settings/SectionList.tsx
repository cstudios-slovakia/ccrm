import React from "react";
import { cn } from "../../utils/cn";
import { settingsPath } from "./settingsRegistry.ts";

/** DOM id of a section's anchor; one category is on screen at a time, so this is unique. */
export const sectionDomId = (categoryId: string, sectionId: string) => `settings-${categoryId}-${sectionId}`;

export interface SectionNode {
  id: string;
  node: React.ReactNode;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The scrolling behaviour of a category page: `settings/<category>/<section>` scrolls to
 * that section and flashes it; scrolling by hand moves the "current section" the tabs and
 * the phone dropdown show. Shared by the tile and the sidebar layouts.
 */
export const useSectionScroll = (categoryId: string, sectionIds: string[], routeSectionId: string | null) => {
  const [activeId, setActiveId] = React.useState<string>(routeSectionId ?? sectionIds[0] ?? "");
  const [flashId, setFlashId] = React.useState<string | null>(null);
  const flashTimer = React.useRef<number | undefined>(undefined);
  const idsKey = sectionIds.join("|");

  const scrollRoot = (): HTMLElement | null => document.querySelector<HTMLElement>("main.workspace");

  const scrollToSection = React.useCallback(
    (sectionId: string) => {
      const el = document.getElementById(sectionDomId(categoryId, sectionId));
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      setActiveId(sectionId);
      setFlashId(sectionId);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1600);
    },
    [categoryId],
  );

  // A new route: scroll to its section, or to the top of the category.
  React.useEffect(() => {
    if (routeSectionId) {
      // After the sections have mounted and laid out.
      const raf = requestAnimationFrame(() => scrollToSection(routeSectionId));
      return () => cancelAnimationFrame(raf);
    }
    scrollRoot()?.scrollTo({ top: 0, behavior: "auto" });
    setActiveId(idsKey.split("|")[0] ?? "");
    return undefined;
  }, [categoryId, routeSectionId, idsKey, scrollToSection]);

  // Scroll-spy: the last section whose top has passed the reading line.
  React.useEffect(() => {
    const root = scrollRoot();
    if (!root) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = root.getBoundingClientRect().top + 140;
      let current = idsKey.split("|")[0] ?? "";
      for (const id of idsKey.split("|")) {
        const el = document.getElementById(sectionDomId(categoryId, id));
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [categoryId, idsKey]);

  React.useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /** Navigate to a section: through the hash (so the address is shareable), scrolling by hand if it is already there. */
  const goTo = React.useCallback(
    (sectionId: string) => {
      const target = "#" + settingsPath(categoryId, sectionId);
      if (window.location.hash === target) scrollToSection(sectionId);
      else window.location.hash = target;
    },
    [categoryId, scrollToSection],
  );

  return { activeId, flashId, goTo };
};

/** The sections of a category, stacked. Each is an anchor the tabs and deep links scroll to. */
export const SectionList: React.FC<{
  categoryId: string;
  sections: SectionNode[];
  flashId: string | null;
  className?: string;
}> = ({ categoryId, sections, flashId, className }) => (
  <div className={cn("flex min-w-0 flex-col gap-6", className)}>
    {sections.map((s) => (
      <section
        key={s.id}
        id={sectionDomId(categoryId, s.id)}
        data-settings-section={s.id}
        data-testid={`settings-section-${categoryId}-${s.id}`}
        className={cn("scroll-mt-36 ws-lg:scroll-mt-24 flex min-w-0 flex-col gap-6 rounded-3xl", flashId === s.id && "settings-section-flash")}
      >
        {s.node}
      </section>
    ))}
  </div>
);
