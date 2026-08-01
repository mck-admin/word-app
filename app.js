(() => {
  const DEFAULT_WAKE_WORD = "hey helper";
  const FILLER_WORDS = new Set([
    "please", "the", "word", "can", "you", "how", "do", "to", "a", "spell",
    "me", "how's", "hows", "for",
  ]);

  const statusText = document.getElementById("statusText");
  const wordArea = document.getElementById("wordArea");
  const wordDisplay = document.getElementById("wordDisplay");
  const letterTiles = document.getElementById("letterTiles");
  const wordNote = document.getElementById("wordNote");
  const micButton = document.getElementById("micButton");
  const micLabel = micButton.querySelector(".big-button-label");
  const clearButton = document.getElementById("clearButton");
  const settingsButton = document.getElementById("settingsButton");
  const settingsModal = document.getElementById("settingsModal");
  const wakeWordInput = document.getElementById("wakeWordInput");
  const settingsSave = document.getElementById("settingsSave");
  const settingsCancel = document.getElementById("settingsCancel");

  const TILE_COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#b197fc", "#f783ac"];

  let wakeWord = (localStorage.getItem("wakeWord") || DEFAULT_WAKE_WORD).toLowerCase().trim();

  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listeningRequested = false; // whether the user wants the mic armed
  let transcriptBuffer = "";
  let scheduledSpellingTimers = [];

  function setStatus(message, mode) {
    statusText.textContent = message;
    statusText.classList.remove("listening", "error");
    if (mode) statusText.classList.add(mode);
  }

  function idlePrompt() {
    return `Tap the microphone and say "${wakeWord}, spell a word!"`;
  }

  function setMicButtonState(active) {
    micButton.classList.toggle("active", active);
    micLabel.textContent = active
      ? "Listening..."
      : (wordArea.hidden ? "Start Listening" : "Ask Another Word");
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      // best-effort audio only; the visual letter reveal doesn't depend on this
    }
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function cancelScheduledSpelling() {
    scheduledSpellingTimers.forEach((timer) => clearTimeout(timer));
    scheduledSpellingTimers = [];
  }

  function clearWordDisplay() {
    cancelScheduledSpelling();
    stopSpeaking();
    wordDisplay.textContent = "";
    letterTiles.innerHTML = "";
    wordNote.textContent = "";
    wordArea.hidden = true;
  }

  function showWord(word, note) {
    clearWordDisplay();
    wordArea.hidden = false;
    wordDisplay.textContent = word;
    wordNote.textContent = note || "";
    clearButton.disabled = false;

    const tiles = [...word].map((letter, index) => {
      const tile = document.createElement("div");
      tile.className = "letter-tile";
      tile.textContent = letter;
      tile.style.background = TILE_COLORS[index % TILE_COLORS.length];
      letterTiles.appendChild(tile);
      return tile;
    });

    speakSpelling(word, tiles);
  }

  function speakSpelling(word, tiles) {
    // Timer-driven on purpose: chaining speechSynthesis utterances via
    // onend is unreliable on real devices (Android Chrome in particular
    // often never fires onend for a queued utterance), which would stall
    // the letter reveal after the first tile. The visual animation must
    // not depend on TTS callbacks firing at all.
    const letters = [...word];
    const stepMs = 600;

    letters.forEach((letter, index) => {
      const timer = setTimeout(() => {
        const tile = tiles[index];
        if (tile) tile.classList.add("visible");
        const isLetter = /[a-zA-Z]/.test(letter);
        speak(isLetter ? letter.toUpperCase() : letter);
      }, index * stepMs);
      scheduledSpellingTimers.push(timer);
    });

    const finalTimer = setTimeout(() => {
      speak(word);
    }, letters.length * stepMs);
    scheduledSpellingTimers.push(finalTimer);
  }

  function extractQuery(transcript) {
    const lower = transcript.toLowerCase();
    // Anchor on the LAST time the wake word was said, not the first: the
    // transcript buffer persists across silence-triggered restarts (so a
    // wake word and command split across a pause still combine), so if a
    // kid repeats the wake phrase, only the most recent one should count.
    const wakeIndex = lower.lastIndexOf(wakeWord);
    if (wakeIndex === -1) return null;

    const after = transcript.slice(wakeIndex + wakeWord.length);
    const words = after
      .replace(/[^a-zA-Z0-9'\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    // Also strip the wake word's own tokens, so an earlier or repeated
    // utterance of it (e.g. "hey helper... hey helper spell dog") can't
    // be mistaken for the word to spell.
    const wakeWordTokens = new Set(wakeWord.split(/\s+/).filter(Boolean));
    const meaningful = words.filter(
      (w) => !FILLER_WORDS.has(w.toLowerCase()) && !wakeWordTokens.has(w.toLowerCase())
    );
    if (meaningful.length === 0) return null;

    // Prefer the words after "spell" if present; otherwise use whatever is left.
    return meaningful.join(" ");
  }

  async function lookupWord(word) {
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

  async function handleQuery(rawQuery) {
    pauseListening();
    setStatus(`Looking up "${rawQuery}"...`);

    const result = await lookupWord(rawQuery);

    if (result.found) {
      setStatus("Here's your word!");
      showWord(result.word, "");
    } else if (result.offline) {
      setStatus("I couldn't check the dictionary, but here's what I heard!");
      showWord(rawQuery.split(/\s+/)[0], "(couldn't reach the dictionary)");
    } else {
      setStatus(`I couldn't find "${rawQuery}" in the dictionary.`);
      showWord(rawQuery.split(/\s+/)[0], "(not found in the dictionary — here's what I heard)");
    }

    micButton.disabled = false;
    setMicButtonState(false);
  }

  // Reusing a single SpeechRecognition instance across many restarts is a
  // well-known source of flakiness on real devices (especially Android
  // Chrome): after enough silence-triggered stop/restart cycles the engine
  // can end up in a state where start() silently fails or no more results
  // ever arrive, even though the app's own "listening" state looks fine.
  // Building a brand-new instance for every (re)start avoids that, and the
  // `instance !== recognition` checks make sure a stale instance's late
  // events can't interfere once it's been superseded.
  function buildRecognition() {
    const instance = new SpeechRecognitionImpl();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";

    instance.onresult = (event) => {
      if (instance !== recognition) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          transcriptBuffer += " " + result[0].transcript;
          const query = extractQuery(transcriptBuffer);
          if (query) {
            transcriptBuffer = "";
            handleQuery(query);
            return;
          }
        }
      }
    };

    instance.onerror = (event) => {
      if (instance !== recognition) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("I can't hear you! Please ask a grown-up to allow the microphone.", "error");
        listeningRequested = false;
        setMicButtonState(false);
        micButton.disabled = false;
      } else if (event.error === "no-speech") {
        // keep listening quietly
      } else {
        setStatus("Hmm, something went wrong with listening. Try again!", "error");
      }
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
      } else {
        setMicButtonState(false);
      }
    };

    return instance;
  }

  function startListening() {
    if (!SpeechRecognitionImpl) {
      setStatus(
        "Voice input isn't supported in this browser. Please try Chrome, Edge, or Safari.",
        "error"
      );
      return;
    }
    transcriptBuffer = "";
    listeningRequested = true;
    setMicButtonState(true);
    setStatus("I'm listening...", "listening");
    recognition = buildRecognition();
    try {
      recognition.start();
    } catch (err) {
      // recognition may already be running; ignore
    }
  }

  function pauseListening() {
    listeningRequested = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch (err) {
        // ignore
      }
    }
    setMicButtonState(false);
  }

  micButton.addEventListener("click", () => {
    if (listeningRequested) {
      pauseListening();
      setStatus(idlePrompt());
      return;
    }
    micButton.disabled = true;
    startListening();
    micButton.disabled = false;
  });

  clearButton.addEventListener("click", () => {
    pauseListening();
    clearWordDisplay();
    clearButton.disabled = true;
    setStatus(idlePrompt());
    setMicButtonState(false);
  });

  settingsButton.addEventListener("click", () => {
    wakeWordInput.value = wakeWord;
    settingsModal.hidden = false;
  });

  settingsCancel.addEventListener("click", () => {
    settingsModal.hidden = true;
  });

  settingsSave.addEventListener("click", () => {
    const value = wakeWordInput.value.trim().toLowerCase();
    if (value) {
      wakeWord = value;
      localStorage.setItem("wakeWord", wakeWord);
    }
    settingsModal.hidden = true;
    if (wordArea.hidden) {
      setStatus(idlePrompt());
    }
  });

  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) settingsModal.hidden = true;
  });

  // Initial state
  setStatus(idlePrompt());
  setMicButtonState(false);
  if (!SpeechRecognitionImpl) {
    setStatus(
      "Voice input isn't supported in this browser. Please try Chrome, Edge, or Safari.",
      "error"
    );
    micButton.disabled = true;
  }
})();
