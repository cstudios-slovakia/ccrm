/**
 * Úspešnosť cenových ponúk: accepted price offers over the offers that reached a verdict.
 *
 * Which statuses count as "closed" is a decision the owner still has to confirm, so the two
 * debatable kinds are switches: an offer that lapsed unanswered (`countExpired`, on by default)
 * and one that was withdrawn (`countCancelled`, off by default). Accepted and rejected always count.
 */

import type { InvoiceOffer } from "../../types/index.ts";
import type { KpiStripData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { offerStatusGroup, type OfferStatusDef } from "../offerStatuses.ts";
import { isInRange, parseAppDate, startOfDay } from "./period.ts";

export interface OfferSuccessOptions {
  /** An open (sent) offer whose `validUntil` has passed counts as closed without being accepted. Default true. */
  countExpired?: boolean;
  /** A withdrawn offer counts as closed without being accepted. Default false. */
  countCancelled?: boolean;
}

export const computeOfferSuccess = (
  offers: readonly InvoiceOffer[],
  offerStatuses: readonly OfferStatusDef[],
  period: PerformancePeriod,
  today: Date,
  options: OfferSuccessOptions = {},
): KpiStripData["offerSuccess"] => {
  const countExpired = options.countExpired ?? true;
  const countCancelled = options.countCancelled ?? false;
  const todayStart = startOfDay(today);

  let accepted = 0;
  let closed = 0;

  for (const offer of offers) {
    if (offer.type !== "price_offer") continue;
    const group = offerStatusGroup(offer.status, offerStatuses);

    if (group === "won" || group === "lost" || group === "cancelled") {
      if (group === "cancelled" && !countCancelled) continue;
      const decidedAt = parseAppDate(offer.statusChangedAt) ?? parseAppDate(offer.issuedAt) ?? parseAppDate(offer.createdAt);
      if (!isInRange(decidedAt, period.start, period.end)) continue;
      closed += 1;
      if (group === "won") accepted += 1;
      continue;
    }

    if (group === "open" && countExpired) {
      const validUntil = parseAppDate(offer.validUntil);
      if (!validUntil || validUntil.getTime() >= todayStart.getTime()) continue;
      if (!isInRange(validUntil, period.start, period.end)) continue;
      closed += 1;
    }
  }

  return { ratePct: closed > 0 ? (accepted / closed) * 100 : null, accepted, closed };
};
