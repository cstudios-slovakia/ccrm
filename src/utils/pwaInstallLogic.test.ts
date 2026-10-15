import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTALL_OFFER_COOLDOWN_DAYS,
  detectInstallPlatform,
  dismissalStorageKey,
  installCardState,
  isDismissalActive,
  isEmbedUrl,
  isQaUrl,
  isStandaloneDisplay,
  parseDismissedAt,
  shouldOfferInstall,
} from "./pwaInstallLogic.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
};

test("platform: Chrome on Windows, macOS and Linux is chromium (with and without client hints)", () => {
  for (const userAgent of [UA.chromeWin, UA.chromeMac, UA.chromeLinux, UA.edge]) {
    assert.equal(detectInstallPlatform({ userAgent }), "chromium", userAgent);
    assert.equal(detectInstallPlatform({ userAgent, brands: ["Chromium", "Not.A/Brand"] }), "chromium");
  }
  assert.equal(detectInstallPlatform({ userAgent: "", brands: ["Google Chrome"] }), "chromium");
});

test("platform: iPhone, iPad and iPadOS-as-Mac are ios-safari, even for Chrome on iOS", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.iphone }), "ios-safari");
  assert.equal(detectInstallPlatform({ userAgent: UA.chromeIos }), "ios-safari");
  assert.equal(
    detectInstallPlatform({ userAgent: UA.safariMac, platform: "MacIntel", maxTouchPoints: 5 }),
    "ios-safari",
  );
});

test("platform: desktop Safari and Firefox are other", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.safariMac, platform: "MacIntel", maxTouchPoints: 0 }), "other");
  assert.equal(detectInstallPlatform({ userAgent: UA.firefox }), "other");
});

test("standalone: any installed display mode counts, a plain tab does not", () => {
  assert.equal(isStandaloneDisplay((q) => q === "(display-mode: standalone)"), true);
  assert.equal(isStandaloneDisplay((q) => q === "(display-mode: window-controls-overlay)"), true);
  assert.equal(isStandaloneDisplay(() => false), false);
  assert.equal(isStandaloneDisplay(() => false, true), true);
  assert.equal(isStandaloneDisplay(() => false, false), false);
});

test("card state: installed beats everything, a live prompt gives a button, nothing is a dead end", () => {
  const base = { isInstalled: false, canInstall: false, platform: "chromium" as const, isSecureContext: true };
  assert.equal(installCardState({ ...base, isInstalled: true, canInstall: true }), "installed");
  assert.equal(installCardState({ ...base, canInstall: true }), "can-install");
  assert.equal(installCardState({ ...base, platform: "ios-safari" }), "ios-instructions");
  assert.equal(installCardState({ ...base }), "chromium-manual");
  assert.equal(installCardState({ ...base, platform: "other" }), "unsupported");
  assert.equal(installCardState({ ...base, isSecureContext: false }), "insecure");
  assert.equal(installCardState({ ...base, platform: "ios-safari", isSecureContext: false }), "ios-instructions");
});

test("dismissal: silent for 30 days, then back", () => {
  assert.equal(INSTALL_OFFER_COOLDOWN_DAYS, 30);
  assert.equal(isDismissalActive(null, NOW), false);
  assert.equal(isDismissalActive(undefined, NOW), false);
  assert.equal(isDismissalActive(NOW, NOW), true);
  assert.equal(isDismissalActive(NOW - 29 * DAY - 23 * 3600_000, NOW), true);
  assert.equal(isDismissalActive(NOW - 30 * DAY, NOW), false);
  assert.equal(isDismissalActive(NOW - 90 * DAY, NOW), false);
});

test("dismissal: a timestamp from the future or garbage never silences the offer", () => {
  assert.equal(isDismissalActive(NOW + DAY, NOW), false);
  assert.equal(isDismissalActive(Number.NaN, NOW), false);
  assert.equal(parseDismissedAt("not a number"), null);
  assert.equal(parseDismissedAt(""), null);
  assert.equal(parseDismissedAt(null), null);
  assert.equal(parseDismissedAt("0"), null);
  assert.equal(parseDismissedAt(String(NOW)), NOW);
});

test("dismissal key is per user and case-insensitive", () => {
  assert.equal(dismissalStorageKey("Erik@CRM.com"), dismissalStorageKey("erik@crm.com"));
  assert.notEqual(dismissalStorageKey("erik@crm.com"), dismissalStorageKey("maria@crm.com"));
  assert.equal(dismissalStorageKey(""), dismissalStorageKey("anon"));
});

test("url guards: QA runs and embed mode, in the query or the hash", () => {
  assert.equal(isQaUrl("?qa=3"), true);
  assert.equal(isQaUrl("?x=1&qa=3"), true);
  assert.equal(isQaUrl("?aqa=3"), false);
  assert.equal(isQaUrl(""), false);
  assert.equal(isEmbedUrl("?embed=tasks", ""), true);
  assert.equal(isEmbedUrl("", "#tasks?embed=tasks"), true);
  assert.equal(isEmbedUrl("", "#tasks?embed=true"), true);
  assert.equal(isEmbedUrl("", "#tasks"), false);
  assert.equal(isEmbedUrl("", "#tasks?newTask=embed=tasks"), false);
});

test("offer: only when signed in, installable, not installed, not embedded, not QA, not recently dismissed", () => {
  const ok = { signedIn: true, canInstall: true, isInstalled: false, embedded: false, qaRun: false, dismissedAt: null, now: NOW };
  assert.equal(shouldOfferInstall(ok), true);
  assert.equal(shouldOfferInstall({ ...ok, signedIn: false }), false);
  assert.equal(shouldOfferInstall({ ...ok, canInstall: false }), false);
  assert.equal(shouldOfferInstall({ ...ok, isInstalled: true }), false);
  assert.equal(shouldOfferInstall({ ...ok, embedded: true }), false);
  assert.equal(shouldOfferInstall({ ...ok, qaRun: true }), false);
  assert.equal(shouldOfferInstall({ ...ok, dismissedAt: NOW - 5 * DAY }), false);
  assert.equal(shouldOfferInstall({ ...ok, dismissedAt: NOW - 31 * DAY }), true);
});
