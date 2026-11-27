import React from "react";

/** `ws-lg` in index.css: the workspace container is at least 72em wide. */
const WS_LG_EM = 72;

/**
 * Whether the settings have room for the wide layouts (tiles with sidebar switch,
 * sidebar navigation). Below it only the phone-style tile layout exists.
 *
 * It mirrors the CSS `ws-lg` container query on `<main class="workspace">`, which
 * JavaScript cannot ask directly: the workspace's content width against 72 times its
 * own font size, so it follows the window, the view size and the aside alike.
 *
 * `null` until measured (first layout effect, before paint), so the wrong layout is
 * never painted. Put the returned `ref` on any element inside the workspace.
 */
export function useSettingsWide(): [boolean | null, React.RefObject<HTMLDivElement | null>] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = React.useState<boolean | null>(null);

  React.useLayoutEffect(() => {
    const host = ref.current?.closest<HTMLElement>(".workspace") ?? null;
    const measure = () => {
      if (!host) {
        setWide(window.innerWidth >= WS_LG_EM * 12);
        return;
      }
      const cs = getComputedStyle(host);
      const content = host.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
      setWide(content >= WS_LG_EM * parseFloat(cs.fontSize || "12"));
    };
    measure();
    if (!host || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return [wide, ref];
}
