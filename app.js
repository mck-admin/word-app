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

  function speak(text, onend) {
    if (!("speechSynthesis" in window)) {
      if (onend) setTimeout(onend, 0);
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      if (onend) {
        utterance.onend = onend;
        utterance.onerror = onend;
      }
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      if (onend) setTimeout(onend, 0);
    }
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function clearWordDisplay() {
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
      tile.textContent = letter.toUpperCase();
      tile.style.background = TILE_COLORS[index % TILE_COLORS.length];
      letterTiles.appendChild(tile);
      return tile;
    });

    speakSpelling(word, tiles);
  }

  function speakSpelling(word, tiles) {
    const letters = [...word];
    let i = 0;

    function speakNext() {
      if (i >= letters.length) {
        speak(word);
        return;
      }
      const letter = letters[i];
      const tile = tiles[i];
      const isLetter = /[a-zA-Z]/.test(letter);
      if (tile) tile.classList.add("visible");
      speak(isLetter ? letter.toUpperCase() : letter, speakNext);
      i += 1;
    }

    speakNext();
  }

  function extractQuery(transcript) {
    const lower = transcript.toLowerCase();
    const wakeIndex = lower.indexOf(wakeWord);
    if (wakeIndex === -1) return null;

    const after = transcript.slice(wakeIndex + wakeWord.length);
    const words = after
      .replace(/[^a-zA-Z0-9'\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const meaningful = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()));
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
      if (!response.ok) return { found: false, word: cleaned };
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

  function ensureRecognition() {
    if (recognition || !SpeechRecognitionImpl) return recognition;

    recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
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

    recognition.onerror = (event) => {
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

    recognition.onend = () => {
      if (listeningRequested) {
        try {
          recognition.start();
        } catch (err) {
          // already started; ignore
        }
      } else {
        setMicButtonState(false);
      }
    };

    return recognition;
  }

  function startListening() {
    if (!SpeechRecognitionImpl) {
      setStatus(
        "Voice input isn't supported in this browser. Please try Chrome, Edge, or Safari.",
        "error"
      );
      return;
    }
    ensureRecognition();
    transcriptBuffer = "";
    listeningRequested = true;
    setMicButtonState(true);
    setStatus("I'm listening...", "listening");
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
    stopSpeaking();
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
