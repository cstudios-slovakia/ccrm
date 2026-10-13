/**
 * Dynamic PWA Web App Manifest & Mobile App Title Manager
 * 
 * Synchronizes the PWA installation name, home screen icon title, and Web App Manifest
 * with the configured dynamic CRM system name.
 */

export function updatePwaManifest(systemName: string): void {
    const name = (systemName || "").trim() || "CCRM";

    // 1. Cache to localStorage so index.html pre-mount script can use it immediately on boot
    try {
        localStorage.setItem("crm_system_name", name);
    } catch (_) {}

    if (typeof document === "undefined") return;

    // 2. Update Apple Mobile Web App & Application Name meta tags (for iOS / Safari & Android)
    let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    if (!appleTitleMeta) {
        appleTitleMeta = document.createElement("meta");
        appleTitleMeta.name = "apple-mobile-web-app-title";
        document.head.appendChild(appleTitleMeta);
    }
    appleTitleMeta.content = name;

    let appNameMeta = document.querySelector('meta[name="application-name"]') as HTMLMetaElement | null;
    if (!appNameMeta) {
        appNameMeta = document.createElement("meta");
        appNameMeta.name = "application-name";
        document.head.appendChild(appNameMeta);
    }
    appNameMeta.content = name;

    // 3. The Web App Manifest itself is NOT generated here. `/manifest.json` is rendered
    // by the server (api/manifest.php, system name injected) from the static manifest, so
    // it carries the shortcuts, share target and launch handler. A blob manifest built
    // in the browser used to replace it and silently dropped all of those, and blob URLs
    // cannot resolve the relative shortcut / icon URLs reliably anyway.
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink && manifestLink.href.startsWith("blob:")) {
        manifestLink.href = "/manifest.json";
    }
}

