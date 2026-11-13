import { extractQuery } from "./queryParser.js";
import { isWordAllowed } from "./wordFilter.js";
import { lookupWord } from "./dictionary.js";
import { speak, stopSpeaking, cancelScheduledSpelling, speakSpelling } from "./tts.js";
import { createUI, idlePrompt } from "./ui.js";
import { createSpeechEngine } from "./speech/speech-adapter.js";

// Wires the shared spelling-app logic to a settings adapter (local or
// cloud) and the platform-appropriate speech engine. Each shell's main.js
// calls this once DOM content is ready, injecting its own settings
// implementation — see packages/web-public/main.js for the local-only
// (no accounts) wiring.
export function initApp({ loadSettings, saveSettings }) {
  const ui = createUI();
  const { elements } = ui;
  const settings = loadSettings();
  const speechEngine = createSpeechEngine();

  let listening = false;
  let transcriptBuffer = "";

  function clearWordDisplay() {
    cancelScheduledSpelling();
    stopSpeaking();
    ui.clearWordDisplay();
  }

  function showWord(word, note) {
    clearWordDisplay();
    const tiles = ui.showWord(word, note);
    speakSpelling(word, tiles);
  }

  async function handleQuery(rawQuery) {
    const candidateWord = rawQuery.split(/\s+/)[0];

    pauseListening();

    if (!isWordAllowed(candidateWord, settings)) {
      const message = "Sorry, please try to sound it out.";
      ui.setStatus(message);
      speak(message);
      elements.micButton.disabled = false;
      ui.setMicButtonState(false);
      return;
    }

    ui.setStatus(`Looking up "${rawQuery}"...`);

    const result = await lookupWord(rawQuery);

    if (result.found) {
      ui.setStatus("Here's your word!");
      showWord(result.word, "");
    } else if (result.offline) {
      ui.setStatus("I couldn't check the dictionary, but here's what I heard!");
      showWord(candidateWord, "(couldn't reach the dictionary)");
    } else {
      ui.setStatus(`I couldn't find "${rawQuery}" in the dictionary.`);
      showWord(candidateWord, "(not found in the dictionary — here's what I heard)");
    }

    elements.micButton.disabled = false;
    ui.setMicButtonState(false);
  }

  speechEngine.onFinalResult((transcript) => {
    transcriptBuffer += " " + transcript;
    const query = extractQuery(transcriptBuffer, settings.wakeWord);
    if (query) {
      transcriptBuffer = "";
      handleQuery(query);
    }
  });

  speechEngine.onError((error) => {
    if (error === "not-allowed" || error === "service-not-allowed") {
      ui.setStatus("I can't hear you! Please ask a grown-up to allow the microphone.", "error");
      listening = false;
      ui.setMicButtonState(false);
      elements.micButton.disabled = false;
    } else if (error === "no-speech") {
      // keep listening quietly
    } else {
      ui.setStatus("Hmm, something went wrong with listening. Try again!", "error");
    }
  });

  function startListening() {
    if (!speechEngine.isSupported()) {
      ui.setStatus(
        "Voice input isn't supported in this browser. Please try Chrome, Edge, or Safari.",
        "error"
      );
      return;
    }
    transcriptBuffer = "";
    listening = true;
    ui.setMicButtonState(true);
    ui.setStatus("I'm listening...", "listening");
    speechEngine.start();
  }

  function pauseListening() {
    listening = false;
    speechEngine.stop();
    ui.setMicButtonState(false);
  }

  elements.micButton.addEventListener("click", () => {
    if (listening) {
      pauseListening();
      ui.setStatus(idlePrompt(settings.wakeWord));
      return;
    }
    elements.micButton.disabled = true;
    startListening();
    elements.micButton.disabled = false;
  });

  elements.clearButton.addEventListener("click", () => {
    pauseListening();
    clearWordDisplay();
    elements.clearButton.disabled = true;
    ui.setStatus(idlePrompt(settings.wakeWord));
    ui.setMicButtonState(false);
  });

  elements.settingsButton.addEventListener("click", () => {
    elements.wakeWordInput.value = settings.wakeWord;
    elements.sightWordsToggle.checked = settings.sightWordsEnabled;
    elements.shortWordsToggle.checked = settings.shortWordsEnabled;
    elements.settingsModal.hidden = false;
  });

  elements.settingsCancel.addEventListener("click", () => {
    elements.settingsModal.hidden = true;
  });

  elements.settingsSave.addEventListener("click", () => {
    const value = elements.wakeWordInput.value.trim().toLowerCase();
    if (value) {
      settings.wakeWord = value;
    }
    settings.sightWordsEnabled = elements.sightWordsToggle.checked;
    settings.shortWordsEnabled = elements.shortWordsToggle.checked;
    saveSettings(settings);
    elements.settingsModal.hidden = true;
    if (elements.wordArea.hidden) {
      ui.setStatus(idlePrompt(settings.wakeWord));
    }
  });

  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) elements.settingsModal.hidden = true;
  });

  // Initial state
  ui.setStatus(idlePrompt(settings.wakeWord));
  ui.setMicButtonState(false);
  if (!speechEngine.isSupported()) {
    ui.setStatus(
      "Voice input isn't supported in this browser. Please try Chrome, Edge, or Safari.",
      "error"
    );
    elements.micButton.disabled = true;
  }
}
