import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import type { Language } from "../../utils/translations";

const MAXIMIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

const BTN_ATTR = "data-ccrm-table-fs-btn";
const HOST_CLASS = "ccrm-table-fullscreen-host";
const ANCESTOR_CLASS = "ccrm-fs-ancestor";

function isEligibleTable(table: HTMLTableElement): boolean {
  if (table.closest(".table-page-head-mirror")) return false;
  if (table.closest(".view-size-fixed")) return false;
  if (table.closest("[data-no-fullscreen]")) return false;
  if (table.closest("[data-email-body], [data-pdf-preview], .prose")) return false;
  // Ignore tiny layout/empty tables without rows
  const rows = table.querySelectorAll("tr");
  if (rows.length < 1) return false;
  return true;
}

function resolveTableHost(table: HTMLTableElement): HTMLElement | null {
  const wrap = table.closest(".table-page-wrap") as HTMLElement | null;
  if (wrap) {
    const parent = wrap.parentElement;
    if (
      parent &&
      !parent.classList.contains("workspace") &&
      parent.tagName !== "MAIN" &&
      parent.tagName !== "BODY"
    ) {
      return parent;
    }
    return wrap;
  }
  const scrollWrap = table.closest(".overflow-x-auto, .overflow-auto") as HTMLElement | null;
  if (scrollWrap && scrollWrap !== document.body && !scrollWrap.classList.contains("workspace")) {
    return scrollWrap;
  }
  const parent = table.parentElement;
  if (parent && parent !== document.body && !parent.classList.contains("workspace")) {
    return parent;
  }
  return null;
}

export const TableFullscreenEnhancer: React.FC<{ userLanguage: Language }> = ({ userLanguage }) => {
  const [activeHost, setActiveHost] = useState<HTMLElement | null>(null);

  const labelEnter =
    userLanguage === "sk"
      ? "Zobraziť tabuľku na celú obrazovku"
      : userLanguage === "hu"
      ? "Táblázat teljes képernyőn"
      : "Fullscreen table";

  const labelExit =
    userLanguage === "sk"
      ? "Ukončiť celú obrazovku (Esc)"
      : userLanguage === "hu"
      ? "Teljes képernyő bezárása (Esc)"
      : "Exit fullscreen (Esc)";

  // Exit fullscreen cleanly and restore ancestor classes
  const exitFullscreen = () => {
    setActiveHost((prev) => {
      if (prev) {
        prev.classList.remove(HOST_CLASS);
      }
      document.querySelectorAll(`.${ANCESTOR_CLASS}`).forEach((el) => {
        el.classList.remove(ANCESTOR_CLASS);
      });
      return null;
    });
  };

  // Apply/clear fullscreen classes when activeHost changes
  useEffect(() => {
    if (!activeHost) return;
    if (!document.body.contains(activeHost)) {
      exitFullscreen();
      return;
    }

    const rect = activeHost.getBoundingClientRect();

    activeHost.classList.add(HOST_CLASS);
    const ancestors: HTMLElement[] = [];
    let cur = activeHost.parentElement;
    while (cur && cur !== document.documentElement) {
      cur.classList.add(ANCESTOR_CLASS);
      ancestors.push(cur);
      cur = cur.parentElement;
    }

    // Smooth FLIP expand animation into full viewport
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced && typeof activeHost.animate === "function" && rect.width > 0 && rect.height > 0) {
      const vw = window.innerWidth || rect.width;
      const vh = window.innerHeight || rect.height;
      const sx = Math.max(0.2, Math.min(1, rect.width / vw));
      const sy = Math.max(0.2, Math.min(1, rect.height / vh));
      activeHost.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate(${rect.left}px, ${rect.top}px) scale(${sx}, ${sy})`,
            opacity: 0.92,
            borderRadius: "10px",
          },
          {
            transformOrigin: "top left",
            transform: "translate(0px, 0px) scale(1, 1)",
            opacity: 1,
            borderRadius: "0px",
          },
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't hijack Escape if a modal dialog is open on top
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      exitFullscreen();
    };
    const onHashChange = () => exitFullscreen();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      activeHost.classList.remove(HOST_CLASS);
      for (const a of ancestors) a.classList.remove(ANCESTOR_CLASS);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [activeHost]);

  // Observe DOM for tables inside .workspace (and modals/drawers) and attach fullscreen icon buttons
  useEffect(() => {
    let rafId = 0;

    const scanTables = () => {
      rafId = 0;
      const root = document.querySelector("main.workspace") || document.body;
      const tables = root.querySelectorAll("table");
      const validHosts = new Set<HTMLElement>();

      tables.forEach((tbl) => {
        if (!(tbl instanceof HTMLTableElement) || !isEligibleTable(tbl)) return;
        const host = resolveTableHost(tbl);
        if (!host) return;
        validHosts.add(host);

        if (getComputedStyle(host).position === "static") {
          host.style.position = "relative";
        }

        let btn = host.querySelector(`:scope > button[${BTN_ATTR}]`) as HTMLButtonElement | null;
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.setAttribute(BTN_ATTR, "1");
          btn.className = "ccrm-table-fs-btn";
          btn.innerHTML = MAXIMIZE_SVG;
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveHost((curr) => (curr === host ? null : host));
          });
          host.appendChild(btn);
        }
        btn.title = labelEnter;
        btn.setAttribute("aria-label", labelEnter);
      });

      // Clean up orphaned buttons if a host no longer contains a table
      root.querySelectorAll(`button[${BTN_ATTR}]`).forEach((b) => {
        const parent = b.parentElement;
        if (!parent || !validHosts.has(parent)) {
          b.remove();
        }
      });
    };

    const scheduleScan = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(scanTables);
    };

    scheduleScan();

    const observer = new MutationObserver(scheduleScan);
    const target = document.querySelector("main.workspace") || document.body;
    observer.observe(target, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [labelEnter]);

  if (!activeHost) return null;

  return createPortal(
    <button
      type="button"
      onClick={exitFullscreen}
      title={labelExit}
      aria-label={labelExit}
      data-testid="table-fullscreen-exit"
      style={{ zIndex: 9999 }}
      className="fixed top-3 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/95 hover:bg-white text-gray-800 border border-gray-300 shadow-md text-caption font-semibold backdrop-blur-xs transition cursor-pointer"
    >
      <Minimize2 className="h-3.5 w-3.5" />
      <span>{labelExit}</span>
    </button>,
    document.body,
  );
};
