// Next free document number for a prefix/year, derived from the highest
// number already issued rather than from the list length — a count-based
// scheme neither restarts the sequence in a new year nor survives a gap
// (a deleted or missing document hands out a number still on file).
export function nextDocumentNumber(
  existingDocumentNumbers: (string | null | undefined)[],
  prefix: string,
  year: number,
  padLength = 4
): string {
  const head = `${prefix}-${year}-`;
  const highest = existingDocumentNumbers.reduce((max, docNo) => {
    if (!docNo || !docNo.startsWith(head)) return max;
    const seq = parseInt(docNo.slice(head.length), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${head}${String(highest + 1).padStart(padLength, "0")}`;
}
