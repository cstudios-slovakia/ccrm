/**
 * Release notes ("Novinky") come from Craft CMS only — see
 * `.agents/rules/news-craft-cms.md`. This module owns the GraphQL query, the
 * per-language pick and the ordering, so the header badge, the modal and the
 * Updates page cannot drift apart.
 */

export type UpdateLanguage = "en" | "sk" | "hu";

export const CRAFT_GRAPHQL_URL =
  "https://ccrm.softwaresolutions.sk/index.php?action=graphql/api";

export interface UpdateImage {
  url: string;
  title: string;
}

/**
 * One block of an article's `contentMatrix`. The first three types are the
 * original ones; heading, gallery, callout and changeList arrived with the
 * automated release notes (docs/RELEASE-NOTES.md) and need matching entry types
 * in Craft — until they exist, the query below falls back to the original set.
 */
export interface UpdateBlock {
  __typename: string;
  text?: { html: string } | null;
  image?: UpdateImage[];
  /** Lightswitch in Craft; older entries were read as strings, hence the union. */
  imageDirection?: string | boolean | null;
  /** heading and changeList keep their heading text in the block's own Title. */
  title?: string | null;
  headingText?: string | null;
  headingLevel?: string | null;
  moduleTag?: string | null;
  images?: UpdateImage[];
  galleryColumns?: string | null;
  calloutType?: string | null;
  listType?: string | null;
  /** Plain multi-line text in Craft, one item per line. */
  listItems?: string | null;
}

export interface UpdateEntry {
  id: string;
  title: string;
  siteHandle: string;
  postDate: string;
  version: string;
  contentMatrix: UpdateBlock[];
}

const LEGACY_BLOCKS = `
                __typename
                ... on textblock_Entry { text { html } }
                ... on image_Entry { image { url title } }
                ... on imageWithText_Entry { text { html } image { url title } imageDirection }`;

const EXTENDED_BLOCKS = `${LEGACY_BLOCKS}
                ... on heading_Entry { title headingLevel moduleTag }
                ... on gallery_Entry { images { url title } galleryColumns }
                ... on callout_Entry { calloutType text { html } }
                ... on changeList_Entry { title listType listItems }`;

export const buildUpdateNotesQuery = (extended: boolean): string => `
        query GetUpdateNotes {
          entries(section: "updateNotes", site: "*") {
            id
            title
            siteHandle
            postDate @formatDateTime(format: "Y-m-d")
            ... on news_Entry {
              version
              contentMatrix {${extended ? EXTENDED_BLOCKS : LEGACY_BLOCKS}
              }
            }
          }
        }
      `;

/** Numeric, segment-wise: "1.11.150" > "1.11.99" > "1.11". Suffixes are ignored. */
export const compareVersions = (a: string, b: string): number => {
  const pa = String(a).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * Craft returns one row per site for the same entry. Keep one row per version,
 * in the reader's language when the entry has it (Slovak lives on the
 * `default` site), newest first. Same-day releases order by version, so a
 * patch note published next to its major note lands above it.
 */
export const localizeUpdateNotes = (
  rawEntries: any[],
  language: UpdateLanguage,
): UpdateEntry[] => {
  const groups: Record<string, UpdateEntry[]> = {};
  for (const e of rawEntries || []) {
    if (!e?.version) continue;
    (groups[e.version] ??= []).push(e);
  }

  const localized: UpdateEntry[] = [];
  for (const group of Object.values(groups)) {
    const best =
      group.find((e) => e.siteHandle === language) ||
      (language === "sk" ? group.find((e) => e.siteHandle === "default") : undefined) ||
      group.find((e) => e.siteHandle === "default") ||
      group.find((e) => e.siteHandle === "en") ||
      group[0];
    if (best) localized.push(best);
  }

  return localized.sort(
    (a, b) =>
      new Date(b.postDate).getTime() - new Date(a.postDate).getTime() ||
      compareVersions(b.version, a.version),
  );
};

/** `listItems` is one item per line; blank lines and list markers are dropped. */
export const splitListItems = (text: string | null | undefined): string[] =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

const runQuery = async (query: string): Promise<any> => {
  const res = await fetch(CRAFT_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("Network response was not ok");
  return res.json();
};

/**
 * Fetches and localizes the release notes. Asks for the extended block types
 * first; a Craft install that does not have them yet rejects the whole query
 * ("Unknown type gallery_Entry"), so it is retried with the original three
 * rather than showing no news at all.
 */
export const fetchUpdateNotes = async (language: UpdateLanguage): Promise<UpdateEntry[]> => {
  let json = await runQuery(buildUpdateNotesQuery(true));
  if (!Array.isArray(json?.data?.entries)) {
    json = await runQuery(buildUpdateNotesQuery(false));
  }
  if (!Array.isArray(json?.data?.entries)) {
    throw new Error(json?.errors?.[0]?.message || "Invalid response from Craft CMS");
  }
  return localizeUpdateNotes(json.data.entries, language);
};
