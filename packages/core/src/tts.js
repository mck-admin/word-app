let scheduledSpellingTimers = [];

export function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // best-effort audio only; the visual letter reveal doesn't depend on this
  }
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function cancelScheduledSpelling() {
  scheduledSpellingTimers.forEach((timer) => clearTimeout(timer));
  scheduledSpellingTimers = [];
}

// Timer-driven on purpose: chaining speechSynthesis utterances via
// onend is unreliable on real devices (Android Chrome in particular
// often never fires onend for a queued utterance), which would stall
// the letter reveal after the first tile. The visual animation must
// not depend on TTS callbacks firing at all.
export function speakSpelling(word, tiles) {
  const letters = [...word];
  const stepMs = 600;

  letters.forEach((letter, index) => {
    const timer = setTimeout(() => {
      const tile = tiles[index];
      if (tile) tile.classList.add("visible");
      const isLetter = /[a-zA-Z]/.test(letter);
      // Always speak letters lowercase: some TTS engines (Safari's in
      // particular) announce "capital X" for a bare uppercase letter,
      // which we don't want regardless of the tile's display casing.
      speak(isLetter ? letter.toLowerCase() : letter);
    }, index * stepMs);
    scheduledSpellingTimers.push(timer);
  });

  const finalTimer = setTimeout(() => {
    speak(word);
  }, letters.length * stepMs);
  scheduledSpellingTimers.push(finalTimer);
}
