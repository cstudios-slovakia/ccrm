import { readFileSync } from "node:fs";
import type { DemoDataset, DemoDirectory } from "./demoDataset.ts";
import type { DemoMedia } from "./demoStore.ts";

/** Shared by the demo's unit tests: the real sk dataset, a fixed clock and a small directory. Not imported by the app. */

export const FIXED_NOW = Date.parse("2026-07-15T10:00:00Z"); // 12:00 in Bratislava

export function loadSk(): DemoDataset {
  const file = new URL("../../../../public/api/demo_seed/whatsapp_demo.sk.json", import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as DemoDataset;
}

export const media: DemoMedia = {
  image: (p) => `https://demo.test/${p}.svg`,
  audio: () => "https://demo.test/silence.wav",
  document: () => "https://demo.test/document.txt",
};

const RECORDS = {
  lead: { "demo-clients-1": { name: "Lapidea Horský park", isClient: true }, "demo-clients-10": { name: "Müller Architekten", isClient: false } },
  project: { "demo-projects-1": { name: "Fasáda Horský park", isClient: false } },
} as const;

/** A directory that knows two leads and one project; everything else is "wiped". */
export const directory: DemoDirectory = {
  get(type, id) {
    const table: Record<string, { name: string; isClient: boolean }> = RECORDS[type];
    return table[id] ?? null;
  },
  search(q) {
    const needle = q.trim().toLowerCase();
    const out: ReturnType<DemoDirectory["search"]> = [];
    for (const type of ["lead", "project"] as const) {
      const table: Record<string, { name: string; isClient: boolean }> = RECORDS[type];
      for (const [id, rec] of Object.entries(table)) {
        if (needle && rec.name.toLowerCase().includes(needle)) out.push({ entity_type: type, crm_id: id, name: rec.name, is_client: rec.isClient, url: null });
      }
    }
    return out;
  },
};
