// Dolch pre-primer, primer, and first-grade sight word lists — the
// common, often non-phonetic words kids are expected to memorize by
// sight rather than sound out, covering roughly pre-k through 1st grade.
export const SIGHT_WORDS = new Set([
  "a", "and", "away", "big", "blue", "can", "come", "down", "find", "for",
  "funny", "go", "help", "here", "i", "in", "is", "it", "jump", "little",
  "look", "make", "me", "my", "not", "one", "play", "red", "run", "said",
  "see", "the", "three", "to", "two", "up", "we", "where", "yellow", "you",
  "all", "am", "are", "at", "ate", "be", "black", "brown", "but", "came",
  "did", "do", "eat", "four", "get", "good", "have", "he", "into", "like",
  "must", "new", "no", "now", "on", "our", "out", "please", "pretty",
  "ran", "ride", "saw", "say", "she", "so", "soon", "that", "there",
  "they", "this", "too", "under", "want", "was", "well", "went", "what",
  "white", "who", "will", "with", "yes",
  "after", "again", "an", "any", "as", "ask", "by", "could", "every",
  "fly", "from", "give", "giving", "had", "has", "her", "him", "his",
  "how", "just", "know", "let", "live", "may", "of", "old", "once",
  "open", "over", "put", "round", "some", "stop", "take", "thank",
  "them", "then", "think", "walk", "were", "when",
]);

export function isWordAllowed(word, settings) {
  const normalized = word.toLowerCase();
  if (!settings.sightWordsEnabled && SIGHT_WORDS.has(normalized)) return false;
  if (!settings.shortWordsEnabled && (normalized.length === 3 || normalized.length === 4)) return false;
  return true;
}
