export const DEFAULT_WAKE_WORD = "hey helper";

export const FILLER_WORDS = new Set([
  "please", "the", "word", "can", "you", "how", "do", "to", "a", "spell",
  "me", "how's", "hows", "for",
]);

export function extractQuery(transcript, wakeWord) {
  const lower = transcript.toLowerCase();
  // Anchor on the LAST time the wake word was said, not the first: the
  // transcript buffer persists across silence-triggered restarts (so a
  // wake word and command split across a pause still combine), so if a
  // kid repeats the wake phrase, only the most recent one should count.
  const wakeIndex = lower.lastIndexOf(wakeWord);
  if (wakeIndex === -1) return null;

  const after = transcript.slice(wakeIndex + wakeWord.length);
  // Also strip the wake word's own tokens, so an earlier or repeated
  // utterance of it (e.g. "hey helper... hey helper spell dog") can't
  // be mistaken for the word to spell.
  const wakeWordTokens = new Set(wakeWord.split(/\s+/).filter(Boolean));
  let words = after
    .replace(/[^a-zA-Z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !wakeWordTokens.has(w.toLowerCase()));

  // Anchor on the last "spell" too: whatever follows it is explicitly
  // the target, even if it's a word that would otherwise be filtered
  // out below (e.g. "spell the", "spell a").
  const spellIndex = words.map((w) => w.toLowerCase()).lastIndexOf("spell");
  const explicitSpell = spellIndex !== -1;
  if (explicitSpell) {
    words = words.slice(spellIndex + 1);
  }
  if (words.length === 0) return null;

  const meaningful = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()));

  // Without an explicit "spell", require at least one non-filler word so
  // a partial utterance (e.g. "hey helper, please...") keeps waiting for
  // the rest instead of prematurely matching on "please". With an
  // explicit "spell", fall back to the raw remaining words so a target
  // that's itself a common/filler word ("the", "a") still comes through.
  const finalWords = meaningful.length > 0 ? meaningful : (explicitSpell ? words : []);
  if (finalWords.length === 0) return null;

  return finalWords.join(" ");
}
