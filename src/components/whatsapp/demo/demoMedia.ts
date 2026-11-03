import documentUrl from "./assets/document.txt?no-inline";
import samplesUrl from "./assets/samples.svg";
import silenceUrl from "./assets/silence.wav";
import siteUrl from "./assets/site.svg";
import slabsUrl from "./assets/slabs.svg";
import type { DemoMedia } from "./demoStore.ts";

/**
 * The demo's files, served through Vite (docs/WHATSAPP-DEMO-MODULE.md C5.5). Vite returns `/assets/…` paths and
 * `WaaiClient.mediaUrl()` would put the module base in front of anything starting with `/`, so the addresses are
 * made absolute here and used as they are. The CSP has no `media-src`, so audio must be a same-origin file, not
 * a `data:` or `blob:` address.
 */
const IMAGES: Record<string, string> = { slabs: slabsUrl, samples: samplesUrl, site: siteUrl };

const absolute = (asset: string): string => (/^[a-z][a-z0-9+.-]*:/i.test(asset) ? asset : new URL(asset, window.location.origin).href);

export const demoMedia: DemoMedia = {
  image: (placeholder) => absolute(IMAGES[placeholder] ?? siteUrl),
  audio: () => absolute(silenceUrl),
  document: () => absolute(documentUrl),
};
