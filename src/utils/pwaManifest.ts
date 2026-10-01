/**
 * Dynamic PWA Web App Manifest & Mobile App Title Manager
 * 
 * Synchronizes the PWA installation name, home screen icon title, and Web App Manifest
 * with the configured dynamic CRM system name.
 */

let activeManifestBlobUrl: string | null = null;

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

    // 3. Dynamically update Web App Manifest with a Blob URL
    try {
        const manifestJson = {
            name: name,
            short_name: name,
            description: "Client relationship and operations management dashboard for modern sales pipelines, document flows, and team alignment.",
            start_url: "/",
            display: "standalone",
            background_color: "#f3f6ff",
            theme_color: "#4f46e5",
            orientation: "any",
            icons: [
                {
                    src: "/icon_192.png",
                    sizes: "192x192",
                    type: "image/png",
                    purpose: "any maskable"
                },
                {
                    src: "/icon_512.png",
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "any maskable"
                },
                {
                    src: "/favicon.svg",
                    sizes: "512x512",
                    type: "image/svg+xml",
                    purpose: "any maskable"
                }
            ]
        };

        const manifestBlob = new Blob([JSON.stringify(manifestJson, null, 2)], {
            type: "application/manifest+json",
        });

        if (activeManifestBlobUrl) {
            URL.revokeObjectURL(activeManifestBlobUrl);
        }
        activeManifestBlobUrl = URL.createObjectURL(manifestBlob);

        let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
        if (!manifestLink) {
            manifestLink = document.createElement("link");
            manifestLink.rel = "manifest";
            document.head.appendChild(manifestLink);
        }
        manifestLink.href = activeManifestBlobUrl;
    } catch (err) {
        console.warn("Failed to generate dynamic PWA manifest Blob:", err);
    }
}
