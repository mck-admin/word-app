export async function lookupWord(word) {
  const cleaned = word.trim().split(/\s+/)[0]; // dictionary lookups are single-word
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`
    );
    // A 404 means the dictionary genuinely doesn't have this word. Any
    // other non-OK status (rate limiting, server errors, etc.) is a
    // lookup problem, not a real "not found" — treat it like being
    // offline so a throttled request doesn't get reported as a
    // dictionary miss.
    if (response.status === 404) {
      return { found: false, word: cleaned };
    }
    if (!response.ok) {
      return { found: false, word: cleaned, offline: true };
    }
    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (entry && entry.word) {
      return { found: true, word: entry.word };
    }
    return { found: false, word: cleaned };
  } catch (err) {
    return { found: false, word: cleaned, offline: true };
  }
}
