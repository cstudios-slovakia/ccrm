/**
 * Normalizes and sanitizes agent answers in SAI Answer Mode.
 * Ensures consensus grouping around canonical candidate entities or concise choices
 * rather than scattering into distinct sentence variants.
 */

export function normalizeAnswer(
  rawAnswer: string | undefined | null,
  knownEntities: string[] = []
): string {
  if (!rawAnswer) return 'Bizonytalan';

  let cleaned = rawAnswer.trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();

  // 1. Check if the answer matches or contains any known entity/candidate from the ontology graph
  if (knownEntities && knownEntities.length > 0) {
    const lower = cleaned.toLowerCase();
    const sorted = [...knownEntities].filter(Boolean).sort((a, b) => b.length - a.length);

    for (const entity of sorted) {
      const entTrim = entity.trim();
      if (entTrim.length < 2) continue;
      const entityLower = entTrim.toLowerCase();

      // Exact substring containment
      if (lower.includes(entityLower)) {
        return entTrim;
      }

      // Diacritics-insensitive match (e.g. "Miske Tamás" vs "Miške Tamás")
      const strippedInput = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const strippedEntity = entityLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (strippedInput.includes(strippedEntity) || strippedEntity.includes(strippedInput)) {
        return entTrim;
      }
    }
  }

  // 2. If it's a long sentence or contains punctuation, extract the first 1-3 words
  if (cleaned.length > 25 || cleaned.includes('.') || cleaned.includes('!') || cleaned.includes('?') || cleaned.includes(',')) {
    const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
    cleaned = words.replace(/[.,:;!?]+$/g, '').trim();
  }

  // 3. Fallback length limit
  if (cleaned.length > 25) {
    cleaned = cleaned.slice(0, 25).trim();
  }

  return cleaned || 'Bizonytalan';
}
