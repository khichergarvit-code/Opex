/**
 * `websearch_to_tsquery` ANDs every remaining word together, so passing it a whole conversational
 * sentence requires a chunk to contain every one of "can", "you", "the", "and", "for", "report" —
 * something a short table row or fact never will. We instead pick out the significant words and OR
 * them, so any one matching is enough. Kept on the 'simple' tsvector config throughout (not 'english')
 * so Hindi text isn't broken by English stemming (documents.md).
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'nor', 'so', 'yet',
  'of', 'in', 'on', 'at', 'by', 'to', 'from', 'with', 'without', 'about', 'into', 'over',
  'after', 'before', 'between', 'through', 'during', 'above', 'below', 'up', 'down', 'out',
  'off', 'again', 'further', 'once', 'as', 'than',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'doing',
  'have', 'has', 'had', 'having', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'not', 'no', 'please', 'also', 'just', 'report', 'me',
]);

/** Extracts the significant terms from a natural-language question, as a `to_tsquery`-ready OR expression. Null when nothing significant is left. */
export function buildFtsQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  const unique = [...new Set(terms)];
  if (unique.length === 0) return null;
  return unique.join(' | ');
}
