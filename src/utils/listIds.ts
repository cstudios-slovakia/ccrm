/*
  Permanent numeric ids for the two operator-editable lists a website form can
  address by number: lead sources (`source_id`) and interest categories
  (`category_id`) in the /api/pipeline.php payload.

  The lists themselves stay plain `string[]` — the NAME is the identity
  everywhere else in the app (a lead stores `source`, `lead_categories` stores
  `category_name`, the colour maps are keyed by name). The id exists purely so
  something outside the CRM can name one of them.

  Up to 1.9.19 that id was the item's position, rendered as `index + 1` in
  Settings and resolved as `$list[$id - 1]` in pipeline.php. Dragging a category
  one row up therefore silently re-pointed every form already deployed on the
  customer's website: the same `category_id: 3` began filing leads under a
  different category, with nothing to see in the CRM but new leads in the wrong
  place. Storing the id instead of deriving it separates ordering from identity.

  The rules, which the PHP side mirrors exactly (ccrm_normalize_list_ids in
  api/schema.php) so both ends of a sync agree on the same map:

    * A list with nothing stored yet gets 1..N in its current order — precisely
      the numbers the positional scheme was handing out, so freezing them breaks
      no integration that is live today.
    * Reordering never touches the map.
    * Renaming carries the id across with the name (the Settings handlers move
      the key, exactly as they already do for the colour map).
    * Adding takes the next id above the highest one issued so far.
    * Deleting leaves the entry behind as a tombstone. It costs a few bytes and
      buys the guarantee that a retired id is never re-issued to a different
      item: a form still posting it matches nothing, rather than the wrong thing.
*/

/** Item name -> its permanent id. May hold tombstones for deleted items. */
export type ListIds = Record<string, number>;

/** A stored id, cleaned up: a positive whole number, or 0 for "unusable". */
const readId = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** The highest id ever issued in this map; 0 when it holds none. */
export const highestListId = (ids: ListIds): number =>
  Object.values(ids || {}).reduce<number>((max, id) => Math.max(max, readId(id)), 0);

/** The id a newly added item should take. */
export const nextListId = (ids: ListIds): number => highestListId(ids) + 1;

/**
 * The stored map with an id filled in for every name in `names` that lacks one.
 * Never removes anything, so ids only ever get handed out, never taken back.
 */
export const normalizeListIds = (names: string[], saved: unknown): ListIds => {
  const out: ListIds = {};
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    const src = saved as Record<string, unknown>;
    Object.keys(src).forEach((key) => {
      const id = readId(src[key]);
      if (key !== "" && id > 0) out[key] = id;
    });
  }

  const list = (Array.isArray(names) ? names : []).filter(
    (name): name is string => typeof name === "string" && name !== "",
  );
  const missing = list.filter((name) => !(name in out));
  if (!missing.length) return out;

  // Nothing usable stored: reproduce the old positional numbering one last
  // time, so the ids we freeze are the ones live forms already send.
  if (!Object.keys(out).length) {
    list.forEach((name, idx) => {
      if (!(name in out)) out[name] = idx + 1;
    });
    return out;
  }

  let next = nextListId(out);
  missing.forEach((name) => {
    if (name in out) return; // a duplicate later in the same list
    out[name] = next++;
  });
  return out;
};

/** The id to show for one item. 0 means the map has not been normalised yet. */
export const listIdFor = (name: string, ids: ListIds): number => readId(ids?.[name]);

/**
 * The map as a canonical, order-fixed array of [name, id] pairs.
 *
 * computeSettingsSig in App.tsx compares the client's settings against the ones
 * the server echoes back, and does it by JSON.stringify. Two equal maps written
 * with their keys in a different order would stringify differently and make the
 * settings-sync effect push forever, so the signature never sees the raw
 * object. Same reasoning as normalizeLeadStateSla.
 */
export const listIdsSignature = (ids: ListIds): Array<[string, number]> =>
  Object.entries(ids || {})
    .map(([name, id]) => [name, readId(id)] as [string, number])
    .filter(([name, id]) => name !== "" && id > 0)
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
