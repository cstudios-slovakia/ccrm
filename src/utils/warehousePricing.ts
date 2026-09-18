// `avgPurchasePrice` is an item-wide field (not per warehouse), so a new lot
// must be weighted against the item's total on-hand quantity across every
// warehouse — not just the warehouse the lot happens to land in.
export function nextWeightedAveragePrice(
  totalOnHandAllWarehouses: number,
  oldAvg: number,
  qty: number,
  price: number
): number {
  const newTotalQty = totalOnHandAllWarehouses + qty;
  const newWap = newTotalQty > 0 ? (totalOnHandAllWarehouses * oldAvg + qty * price) / newTotalQty : price;
  return Number(newWap.toFixed(2));
}
