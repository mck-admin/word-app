import { createWebSpeechEngine } from "./speech-web.js";

// Phase 1 adds a Capacitor-native branch here (real speech recognition on
// iOS/Android, fixing the gaps the Web Speech API can't cover — no iOS
// Safari support at all, and Android's flaky in-WebView implementation).
// Until then this always returns the web engine, which is correct for
// web-public (never runs under Capacitor) and for app-shell previewed in a
// plain browser during development.
export function createSpeechEngine() {
  const isNative =
    typeof window !== "undefined" &&
    !!window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform();

  if (isNative) {
    // TODO(Phase 1): return createCapacitorSpeechEngine() once
    // speech-capacitor.js exists.
    return createWebSpeechEngine();
  }
  return createWebSpeechEngine();
}
