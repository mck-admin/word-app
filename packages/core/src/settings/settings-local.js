import { DEFAULT_WAKE_WORD } from "../queryParser.js";

export function loadSettings() {
  return {
    wakeWord: (localStorage.getItem("wakeWord") || DEFAULT_WAKE_WORD).toLowerCase().trim(),
    sightWordsEnabled: localStorage.getItem("sightWordsEnabled") !== "false",
    shortWordsEnabled: localStorage.getItem("shortWordsEnabled") !== "false",
  };
}

export function saveSettings(settings) {
  localStorage.setItem("wakeWord", settings.wakeWord);
  localStorage.setItem("sightWordsEnabled", String(settings.sightWordsEnabled));
  localStorage.setItem("shortWordsEnabled", String(settings.shortWordsEnabled));
}
