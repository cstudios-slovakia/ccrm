/**
 * Leads and clients share one list (`leads`). What makes a record a client is
 * decided here, once, so every picker, badge and link agrees.
 *
 * Same rule the Clients registry uses: an explicit `client-*` record, or a
 * confirmed positive value adjustment. Anything else is a pipeline lead.
 */

export interface ClientRecordLike {
  id?: string;
  name?: string;
  adjustment?: number;
}

export type RecordKind = "client" | "lead";

export const isClientRecord = (record: ClientRecordLike): boolean =>
  (record.id || "").startsWith("client-") || (Number(record.adjustment) || 0) > 0;

export const recordKind = (record: ClientRecordLike): RecordKind =>
  isClientRecord(record) ? "client" : "lead";

/**
 * Hash route of the record's detail page. Clients are routed by name, leads by
 * id — the two routes the app already serves.
 */
export const recordHref = (record: ClientRecordLike): string =>
  isClientRecord(record)
    ? `#client-${encodeURIComponent((record.name || "").trim())}`
    : `#lead-${encodeURIComponent(record.id || "")}`;
