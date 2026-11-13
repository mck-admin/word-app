// Reusing a single SpeechRecognition instance across many restarts is a
// well-known source of flakiness on real devices (especially Android
// Chrome): after enough silence-triggered stop/restart cycles the engine
// can end up in a state where start() silently fails or no more results
// ever arrive, even though the app's own "listening" state looks fine.
// Building a brand-new instance for every (re)start avoids that, and the
// `instance !== recognition` checks make sure a stale instance's late
// events can't interfere once it's been superseded.
export function createWebSpeechEngine() {
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listeningRequested = false;
  let finalResultHandler = null;
  let errorHandler = null;

  function buildRecognition() {
    const instance = new SpeechRecognitionImpl();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";

    instance.onresult = (event) => {
      if (instance !== recognition) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && finalResultHandler) {
          finalResultHandler(result[0].transcript);
        }
      }
    };

    instance.onerror = (event) => {
      if (instance !== recognition) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        listeningRequested = false;
      }
      if (errorHandler) errorHandler(event.error);
    };

    instance.onend = () => {
      if (instance !== recognition) return;
      if (listeningRequested) {
        // A short pause before restarting lets the OS release the mic
        // between sessions instead of immediately re-requesting it, which
        // is what tends to make the engine stop responding after a while.
        setTimeout(() => {
          if (!listeningRequested || instance !== recognition) return;
          recognition = buildRecognition();
          try {
            recognition.start();
          } catch (err) {
            // ignore; nothing more we can do if the engine refuses to start
          }
        }, 300);
      }
    };

    return instance;
  }

  return {
    isSupported: () => !!SpeechRecognitionImpl,
    start() {
      if (!SpeechRecognitionImpl) return;
      listeningRequested = true;
      recognition = buildRecognition();
      try {
        recognition.start();
      } catch (err) {
        // recognition may already be running; ignore
      }
    },
    stop() {
      listeningRequested = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (err) {
          // ignore
        }
      }
    },
    onFinalResult(cb) {
      finalResultHandler = cb;
    },
    onError(cb) {
      errorHandler = cb;
    },
  };
}
