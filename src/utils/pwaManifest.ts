import { resolveSystemTitle, resolveTitleWithProduct } from "./brand.ts";

/**
 * Dynamic PWA Web App Manifest & Mobile App Title Manager
 *
 * Synchronizes the PWA installation name, home screen icon title, and Web App Manifest
 * with the company's system title. `override` is the stored title ("" = none).
 *
 *  - the home-screen label (apple-mobile-web-app-title, manifest short_name) is the
 *    title alone: "Lapidea";
 *  - the full application name (application-name, manifest name) carries the product
 *    too: "Lapidea (Koperniq)". With no title of its own both are just "Koperniq".
 */

export function updatePwaManifest(override: string): void {
    const shortName = resolveSystemTitle(override);
    const fullName = resolveTitleWithProduct(override);

    // 1. Cache to localStorage so index.html pre-mount script can use it immediately on boot
    try {
        localStorage.setItem("crm_system_name", shortName);
        localStorage.setItem("crm_system_name_full", fullName);
    } catch (_) {}

    if (typeof document === "undefined") return;

    // 2. Update Apple Mobile Web App & Application Name meta tags (for iOS / Safari & Android)
    let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    if (!appleTitleMeta) {
        appleTitleMeta = document.createElement("meta");
        appleTitleMeta.name = "apple-mobile-web-app-title";
        document.head.appendChild(appleTitleMeta);
    }
    appleTitleMeta.content = shortName;

    let appNameMeta = document.querySelector('meta[name="application-name"]') as HTMLMetaElement | null;
    if (!appNameMeta) {
        appNameMeta = document.createElement("meta");
        appNameMeta.name = "application-name";
        document.head.appendChild(appNameMeta);
    }
    appNameMeta.content = fullName;

    // 3. The Web App Manifest itself is NOT generated here. `/manifest.json` is rendered
    // by the server (api/manifest.php, system title injected) from the static manifest, so
    // it carries the shortcuts, share target and launch handler. A blob manifest built
    // in the browser used to replace it and silently dropped all of those, and blob URLs
    // cannot resolve the relative shortcut / icon URLs reliably anyway.
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink && manifestLink.href.startsWith("blob:")) {
        manifestLink.href = "/manifest.json";
    }
}
