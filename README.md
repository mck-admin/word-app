# Spelling Helper

A simple, voice-controlled spelling app for kids (ages ~3-7). Say a wake
word followed by "spell &lt;word&gt;" and the app looks the word up and
spells it out loud, letter by letter, with big colorful letter tiles that
stay on screen until cleared.

It's a static web app — no build step, no server, no accounts.

## Running it

Just serve the folder and open it in a browser (Chrome, Edge, or Safari
recommended — these have the best support for the Web Speech API):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` on a phone, tablet, or laptop with a
microphone. It needs to be served over `http://localhost` or `https://`
(browsers block microphone access on plain `http://` from a network IP).

For real use (e.g. on a tablet at home), deploy the three files
(`index.html`, `style.css`, `app.js`) to any static host with HTTPS, such
as GitHub Pages, Netlify, or Vercel.

## How it works

1. Tap the big green microphone button to start listening.
2. Say the wake word (default: "hey helper") followed by "spell" and a
   word, e.g. "Hey helper, please spell elephant."
3. The app looks the word up via the free
   [dictionaryapi.dev](https://dictionaryapi.dev/) dictionary (no API key
   needed) to confirm the spelling, then displays it in large text and
   spells it out loud one letter at a time with animated tiles.
4. The word stays on screen — the microphone turns off automatically —
   until a grown-up or kid presses **Clear** (resets to the idle screen)
   or **Ask Another Word** (clears the word and starts listening again).
5. If the word isn't in the dictionary, or the dictionary can't be
   reached, the app falls back to spelling out whatever it heard, with a
   note explaining that.

The wake word is configurable via the gear icon in the top-right corner
and is saved in the browser's local storage.

## Browser support

Voice input relies on the Web Speech API (`SpeechRecognition`), which is
best supported in Chrome, Edge, and Safari. Firefox does not currently
support it — the app will show a message asking to switch browsers rather
than failing silently.
