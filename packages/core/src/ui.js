const TILE_COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#b197fc", "#f783ac"];

export function idlePrompt(wakeWord) {
  return `Tap the microphone and say "${wakeWord}, spell a word!"`;
}

export function createUI() {
  const elements = {
    statusText: document.getElementById("statusText"),
    wordArea: document.getElementById("wordArea"),
    wordDisplay: document.getElementById("wordDisplay"),
    letterTiles: document.getElementById("letterTiles"),
    wordNote: document.getElementById("wordNote"),
    micButton: document.getElementById("micButton"),
    clearButton: document.getElementById("clearButton"),
    settingsButton: document.getElementById("settingsButton"),
    settingsModal: document.getElementById("settingsModal"),
    wakeWordInput: document.getElementById("wakeWordInput"),
    sightWordsToggle: document.getElementById("sightWordsToggle"),
    shortWordsToggle: document.getElementById("shortWordsToggle"),
    settingsSave: document.getElementById("settingsSave"),
    settingsCancel: document.getElementById("settingsCancel"),
  };
  const micLabel = elements.micButton.querySelector(".big-button-label");

  function setStatus(message, mode) {
    elements.statusText.textContent = message;
    elements.statusText.classList.remove("listening", "error");
    if (mode) elements.statusText.classList.add(mode);
  }

  function setMicButtonState(active) {
    elements.micButton.classList.toggle("active", active);
    micLabel.textContent = active
      ? "Listening..."
      : (elements.wordArea.hidden ? "Start Listening" : "Ask Another Word");
  }

  // Clears only the DOM — callers that need to stop in-flight TTS/timers
  // first should do so before calling this (see core/src/index.js).
  function clearWordDisplay() {
    elements.wordDisplay.textContent = "";
    elements.letterTiles.innerHTML = "";
    elements.wordNote.textContent = "";
    elements.wordArea.hidden = true;
  }

  // Renders the word and returns the created tile elements; does not clear
  // first and does not start TTS — the caller (core/src/index.js) composes
  // this with clearWordDisplay() and tts.speakSpelling().
  function showWord(word, note) {
    elements.wordArea.hidden = false;
    elements.wordDisplay.textContent = word;
    elements.wordNote.textContent = note || "";
    elements.clearButton.disabled = false;

    return [...word].map((letter, index) => {
      const tile = document.createElement("div");
      tile.className = "letter-tile";
      tile.textContent = letter;
      tile.style.background = TILE_COLORS[index % TILE_COLORS.length];
      elements.letterTiles.appendChild(tile);
      return tile;
    });
  }

  return { elements, setStatus, setMicButtonState, clearWordDisplay, showWord };
}
