# Spelling Helper

A simple, voice-controlled spelling app for kids (ages ~3-7). Say a wake
word followed by "spell &lt;word&gt;" and the app looks the word up and
spells it out loud, letter by letter, with big colorful letter tiles that
stay on screen until cleared.

## Project structure

```
packages/
  core/         shared logic (plain ES modules, no dependencies, no build step)
    src/
      wordFilter.js      sight-word list + the sight-words/short-words parental-control gate
      dictionary.js      dictionaryapi.dev lookup
      queryParser.js     wake-word + "spell <word>" parsing
      tts.js             text-to-speech + the timer-driven letter reveal
      ui.js              DOM wiring (status text, word display, letter tiles, settings modal)
      speech/
        speech-web.js     Web Speech API recognition (today's only engine)
        speech-adapter.js  picks an engine; will branch to a native one later
      settings/
        settings-local.js  localStorage-backed settings (wake word, the two toggles)
      index.js            orchestration — wires the above together
  web-public/   the deployable static site — no accounts, no backend, exactly what shipped before
    index.html, style.css, main.js
```

`web-public` is still a plain static site: no bundler, no npm dependencies,
nothing to install. It imports `core` via ordinary relative `<script
type="module">` imports, so serving the `packages/` folder is enough —
there's no build step between editing a file and seeing the change.

(This split exists to support an in-progress native app, built alongside
`web-public` in the same `core` modules rather than a rewrite — see the
plan notes in this repo's history if you're picking this up later. None of
that is shipped yet; `web-public` today behaves identically to the
single-file version it replaced.)

## Running it

Serve the `packages/` folder (not the repo root, and not `web-public/` on
its own — `web-public` imports from its sibling `core` folder via relative
paths):

```
cd packages
python3 -m http.server 8000
```

Then open `http://localhost:8000/web-public/` on a phone, tablet, or laptop
with a microphone. It needs to be served over `http://localhost` or
`https://` (browsers block microphone access on plain `http://` from a
network IP).

## Deploying

This repo deploys to GitHub Pages via `.github/workflows/deploy-pages.yml`,
which publishes the whole `packages/` folder on every push to `main` (so
`web-public`'s relative imports into `core` keep working once deployed).

**One-time setup required:** GitHub Pages must be switched from "Deploy
from a branch" to **"GitHub Actions"** as its source — go to this repo's
Settings → Pages → Build and deployment → Source, and pick "GitHub
Actions". Once that's set, every push to `main` redeploys automatically.

**The site URL changed** from the repo root to `<pages-url>/web-public/`,
because `core` has to be published alongside `web-public` for its imports
to resolve — there's no single-folder deploy that keeps both the old root
URL and a build-free static site. Update any existing bookmarks.

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
6. A grown-up can turn off sight words and/or short (3-4 letter) words via
   the settings gear icon, to encourage sounding those out instead — asking
   for a disabled word gets "Sorry, please try to sound it out." instead of
   an answer.

The wake word and both toggles are configurable via the gear icon in the
top-right corner and are saved in the browser's local storage.

## Browser support

Voice *input* relies on the Web Speech API (`SpeechRecognition`), which
only works in Chromium-based browsers (Chrome, Edge) today. **Safari
(desktop and iOS) does not implement `SpeechRecognition` at all** — voice
queries won't work there, though text-to-speech (spelling words out loud)
still does. Firefox doesn't support it either. The app shows a message
asking to switch browsers rather than failing silently when voice input
isn't available at all.
