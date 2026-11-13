# Plan: word-app → Capacitor + Supabase Multi-Profile Spelling App

**Status (as of this doc):** Phase 0 is complete and merged (see git log — "Restructure into
packages/core + packages/web-public (Phase 0)"). Phases 1-4 below are not started.

**Recommended environment from Phase 1 onward:** run Claude Code locally on a Mac, not a remote
sandbox. Phase 1 specifically requires building/signing/running on real iOS/Android hardware
(Xcode only runs on macOS; Simulator isn't reliable for speech-framework behavior), which a
remote session can't do. A fresh local session should start by reading this file, the README,
and recent git log — that's sufficient context to continue; there's no other state to transfer.

**Local setup needed before starting Phase 1** (on the Mac that will do the work):
- Xcode (free, Mac App Store) — also installs Git via its Command Line Tools
- Node.js (LTS) + npm — `brew install node` or nodejs.org
- CocoaPods — `brew install cocoapods` (Capacitor's iOS build needs it)
- Android Studio (free, developer.android.com) — Android build + `adb` device access
- A free Apple ID is enough to sign/install a dev build on an iPhone for 7 days at a time; the
  $99/yr Apple Developer Program is only needed for longer-lived installs or TestFlight, not to
  start
- USB cable or wireless debugging to the test devices; enable Developer Options + USB debugging
  on the Android tablet

## Context

The app currently works as a static web app, but two real problems emerged from device testing: Android Chrome's Web Speech API goes unresponsive after repeated use, and iOS Safari has **no speech recognition support at all** (confirmed via research) — voice input simply cannot work on an iPhone in a browser. Separately, the goal is to extend the app to track each kid's progress and manage parental controls per child, with settings synced across devices (e.g. managing a kid's settings from a parent's phone while the kid uses a shared tablet).

This plan moves to a native app (via Capacitor, reusing the existing code rather than a rewrite) with real speech recognition plugins to fix the reliability problem, backed by a managed backend (Supabase) for per-child accounts, settings, and progress — while keeping the existing static site alive as a no-signup public version for other families to try. Scope is deliberately limited to the user's own family for now; public distribution concerns (COPPA consent flows, app store listings, etc.) are explicitly deferred, listed at the end so they aren't silently lost.

A requirement folded in during planning: a **configurable daily limit on how many words can be requested**, with a refusal response in the same style as the existing "Sorry, please try to sound it out." block message when a child is over the limit.

## Current state (post-Phase-0 — see packages/ layout below; this supersedes the pre-restructure file list this plan was originally written against)

- `packages/core/src/` — the shared logic, already split into modules (this *is* the Phase-0 output, not a future step):
  - `speech/speech-web.js` — Web Speech API handling, including hard-won device workarounds (fresh-instance-per-restart, 300ms restart delay, stale-instance guards for Android flakiness) — preserve these, don't rewrite them, when adding `speech-capacitor.js`.
  - `tts.js` — timer-driven TTS, deliberately decoupled from `onend` callbacks (another device-flakiness fix).
  - `queryParser.js` — wake-word/command parsing (`extractQuery`, `FILLER_WORDS`, `DEFAULT_WAKE_WORD`).
  - `dictionary.js` — `lookupWord()` against `api.dictionaryapi.dev`.
  - `wordFilter.js` — `isWordAllowed(word, settings)`, the existing sight-words/short-words gate. This is the integration point the new daily-limit check extends.
  - `settings/settings-local.js` — the three existing `localStorage` keys (`wakeWord`, `sightWordsEnabled`, `shortWordsEnabled`).
  - `speech/speech-adapter.js` — already has the platform-detection seam Phase 1 fills in (currently always returns the web engine with a `TODO(Phase 1)` marker).
  - `index.js` — orchestration wiring all of the above together; this is what the new daily-limit check slots into (see §5).
- `packages/web-public/` — the deployable static site (`index.html`, `style.css`, `main.js`), still zero-dependency/zero-build-step, imports `core` via relative `<script type="module">` paths.
- `.github/workflows/deploy-pages.yml` — deploys `packages/` (not just `web-public/`) via GitHub Actions, since `web-public`'s relative imports into `core` need both published together.

## Recommended architecture

### 1. Project structure — adding app-shell alongside the existing core/web-public split

```
word-app/
├── package.json                     # npm workspaces root (new — Phase 1 introduces npm)
├── packages/
│   ├── core/src/                    # EXISTS (Phase 0) — add to it, don't restructure it
│   │   ├── wordFilter.js, dictionary.js, queryParser.js, tts.js, ui.js, index.js   # existing
│   │   ├── speech/
│   │   │   ├── speech-adapter.js        # existing — fill in the native branch
│   │   │   ├── speech-web.js            # existing — leave as-is
│   │   │   └── speech-capacitor.js      # NEW — wraps @capacitor-community/speech-recognition
│   │   ├── settings/
│   │   │   ├── settings-local.js        # existing — add dailyWordLimit
│   │   │   └── settings-cloud.js        # NEW (Phase 3) — Supabase child_settings CRUD
│   │   ├── usage/                       # NEW
│   │   │   ├── usage-local.js           # localStorage daily counter (web-public)
│   │   │   └── usage-cloud.js           # Supabase progress_log-derived daily count (app-shell)
│   │   └── progress/                    # NEW (Phase 3)
│   │       ├── progress-noop.js         # no-op logger (web-public)
│   │       └── progress-cloud.js        # Supabase progress_log insert
│   ├── web-public/                  # EXISTS (Phase 0) — unchanged except the web-public daily-limit addition
│   └── app-shell/                   # NEW — the Capacitor project (the "family" app)
│       ├── capacitor.config.ts, package.json
│       ├── src/ (index.html, style.css, main.js, auth/{supabase-client,login-screen,profile-picker,pin-gate}.js)
│       ├── www/            # esbuild output, gitignored
│       ├── ios/            # generated by `npx cap add ios`
│       └── android/        # generated by `npx cap add android`
├── supabase/migrations/*.sql, supabase/config.toml   # NEW (Phase 2)
```

**Why:** `web-public` stays dependency-free and deploys exactly as today (no bundler, never imports an npm-only package) — the public no-signup promise doesn't get more complicated just because the native app exists. `app-shell` gets a minimal bundler (esbuild) only because Capacitor plugins and `@supabase/supabase-js` are npm packages. `core` has zero platform-specific imports at the top level; each shell's `main.js` injects which concrete `settings`/`usage`/`progress` implementation to use — the only runtime platform *detection* is in `speech-adapter.js`, so `app-shell` previewed in a plain browser during dev still falls back to Web Speech API instead of crashing.

### 2. Backend/data model — Supabase

Supabase over Firebase: the data is parent → children → per-child settings → append-only progress log, a clean relational shape with foreign keys. Postgres RLS policies as plain `exists (select 1 from children where ...)` subqueries are a direct match for "a parent can only touch their own family's rows." Supabase Auth's `auth.users` gives the parent-account layer for free.

```sql
create table public.parents (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  display_name text not null,
  avatar_key text not null default 'fox',
  birth_year int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Replaces today's localStorage settings — one row per child
create table public.child_settings (
  child_id uuid primary key references public.children(id) on delete cascade,
  wake_word text not null default 'hey helper',
  sight_words_enabled boolean not null default true,
  short_words_enabled boolean not null default true,
  daily_word_limit int,              -- NULL = unlimited (default); set by parent to enable the cap
  updated_at timestamptz not null default now()
);

create table public.parent_pin (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  pin_hash text not null,            -- pgcrypto crypt(), never plaintext
  updated_at timestamptz not null default now()
);

create table public.progress_log (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.children(id) on delete cascade,
  word_requested text not null,
  word_resolved text,
  outcome text not null check (outcome in ('found','not_found','blocked','offline')),
  blocked_by text check (blocked_by in ('sight_words','short_words','daily_limit', null)),
  created_at timestamptz not null default now()
);

create index on public.children (parent_id);
create index on public.progress_log (child_id, created_at desc);

create function public.handle_new_user() returns trigger as $$
begin
  insert into public.parents (id, display_name) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

RLS (enable on all five tables): `parents`/`children`/`parent_pin` scoped by `parent_id = auth.uid()` (or `id = auth.uid()` for `parents`); `child_settings`/`progress_log` scoped via `exists (select 1 from children c where c.id = <table>.child_id and c.parent_id = auth.uid())`, for both `using` and `with check`.

There is deliberately **no separate kid auth** — every device authenticates as the same parent Supabase session; the child-profile picker is a client-side UI layer selecting which `child_id` to scope to. The PIN is verified server-side via a `security definer` RPC using `crypt()`, so the hash never leaves the DB. The Supabase anon/publishable key shipped in the app bundle is safe (RLS enforces access, not key secrecy); no service-role key is ever used client-side.

**Daily-limit counting:** derive the count from `progress_log` rather than a separate counter column, to avoid drift — `count(*) from progress_log where child_id = :id and created_at >= :startOfTodayLocal and outcome != 'blocked'`. Only "answered" attempts (found/not_found/offline) count toward usage; attempts blocked by sight-words, short-words, or the limit itself do not consume a slot. `:startOfTodayLocal` is computed client-side from the device's local timezone (simplest; a single family's devices are assumed to share a timezone) and passed as a parameter, rather than relying on a server-side UTC day boundary that could mismatch the family's actual day.

### 3. Child profile UX (ages 3-7)

- First run per device: normal Supabase email/password login (parent-only, once per device). Session persisted via `@capacitor/preferences` (Keychain/Keystore-backed).
- Profile picker: big tappable avatar tiles (reusing the existing big-button visual language), one per child. Tapping one sets `currentChildId` in local device state and loads that child's `child_settings` — no kid-facing password ever exists.
- Settings access: gear icon → 4-digit PIN pad → `verify_parent_pin` RPC → "Family Settings" screen (manage children, edit each child's wake word / toggles / **daily word limit** / switch profile / sign out). PIN recovery is just re-authenticating as the parent, not a self-service email flow.
- **Daily-limit UI:** same pattern as the existing sight-words/short-words toggle rows — a toggle "Limit words per day" that reveals a number input when enabled; off/blank = unlimited (matches `daily_word_limit = NULL`).

### 4. Native speech plugin integration

`@capacitor-community/speech-recognition` wraps Android's native `SpeechRecognizer` and iOS's `SFSpeechRecognizer` — this is the direct fix for both known problems (iOS gets real speech input for the first time; Android moves off the WebView JS-level shim where the flakiness lives). TTS stays on `speechSynthesis` for now (confirmed to work in iOS WKWebView) — a native TTS plugin is a phase 3+ stretch item only, not a blocker.

Abstraction seam (`packages/core/src/speech/speech-adapter.js` — already exists with a `TODO(Phase 1)` marker):

```js
export function createSpeechEngine() {
  const isNative = typeof window !== "undefined" && !!window.Capacitor && window.Capacitor.isNativePlatform?.();
  if (isNative) return createCapacitorSpeechEngine(); // Phase 1: fill this in
  return createWebSpeechEngine();
}
```

Both engines implement the same surface (`start()`, `stop()`, `onFinalResult(cb)`, `onError(cb)`, `isSupported()` — see `speech-web.js` for the exact shape already in use); `speech-web.js` is left untouched, workarounds intact. Orchestration in `index.js` already calls `engine.start()`/`stop()` through this seam rather than touching `SpeechRecognitionImpl` directly. Since `web-public` has no bundler and never imports `node_modules`, it's structurally impossible for it to pull in Capacitor plugin code.

Permissions: Android `RECORD_AUDIO` in `AndroidManifest.xml`; iOS `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` in `Info.plist`.

### 5. Query flow, including the daily-limit gate

Extends `handleQuery` in `packages/core/src/index.js` with one additional check, ordered to minimize wasted work:

1. **Daily-limit check (new, async for app-shell, sync for web-public):** if the child's resolved usage count for today ≥ `daily_word_limit` (and the limit isn't null/unlimited), respond immediately: status + spoken message *"Sorry, you've used all your spelling turns for today. Ask a grown-up, or try again tomorrow!"* — same UX pattern as the existing block message (status text + `speak()`, no word shown), log `outcome='blocked', blocked_by='daily_limit'` (app-shell only), and stop. No dictionary lookup, no category check.
2. **Existing `isWordAllowed()` category check** (sight-words/short-words) — unchanged logic, same "Sorry, please try to sound it out." response; log `blocked_by` accordingly.
3. **Existing dictionary lookup + `showWord`** — on completion, increment usage: insert the `progress_log` row (app-shell) or increment the localStorage daily counter (web-public).

**`web-public` equivalent:** a `dailyWordLimit` setting alongside the existing two in `settings-local.js`, plus a `usage-local.js` counter stored as `{date: 'YYYY-MM-DD', count: N}` in localStorage, reset on date change, incremented only on non-blocked outcomes. This keeps the feature available in the no-accounts public version too, not native-exclusive — and could ship independently of the rest of this plan if desired, since it needs no backend.

### 6. Sync logic (app-shell)

Online-required, matching the existing constraint that dictionary lookups already need network — no offline queue for v1. App launch restores session → fetches `children` → profile picker. Profile selection fetches/upserts that child's `child_settings`. Settings save upserts `child_settings`. Each spelling attempt fires a fire-and-forget `progress_log` insert after `handleQuery` resolves an outcome (errors swallowed — logging must never degrade the kid's experience). `web-public` keeps its local-only stubs entirely unchanged otherwise.

### 7. Phased rollout

- **Phase 0 — Repo restructure, no behavior change. ✅ DONE.** `app.js` split into `packages/core/src/*`; static site moved to `packages/web-public/`; Pages Actions workflow added. Verified via headless-browser smoke test (Playwright) that structure/DOM wiring was unregressed.
- **Phase 1 — Capacitor scaffold + native speech plugin.** *(Needs local Mac + Xcode + Android Studio — see the environment note at the top of this doc.)* Scaffold `ios/`/`android/`, add the speech plugin, write `speech-capacitor.js`, edit permission manifests, build/sign/run on a real iPhone and a real Android device, confirm the plugin actually fixes the original flakiness.
- **Phase 2 — Supabase backend.** Author migrations/RLS; create the real Supabase project; apply migrations.
- **Phase 3 — Accounts, profiles, PIN gate, cloud sync, daily-limit UI.** Login screen, profile picker, PIN gate, `settings-cloud.js`, `usage-cloud.js`, `progress-cloud.js`, Family Settings screen including the daily-limit toggle, wired into `app-shell`.
- **Phase 4 — Real-world rollout.** Install on the family's actual devices, create profiles, iterate from real-hardware reports.
- The `web-public` daily-limit feature (§5's "web-public equivalent") has no backend dependency and can be built/shipped any time, independent of this phasing, the same way the existing sight-words/short-words toggles were.

### 8. Deferred / explicitly out of scope for now

COPPA-compliant verifiable parental consent; public self-serve sign-up; App/Play Store listings and public privacy policy; push notifications; offline-first sync/conflict resolution; multiple parents per family account; localization; payments; charted progress dashboards (a simple recent-activity list is in scope, graphs are not); PIN RPC brute-force rate limiting (fine at family scale); CI-based signed native builds. None of these block the data model above (separate `parents`/`children` tables, PIN-as-RPC) from being extended later without a redesign.

## Verification

- **Phase 0:** ✅ done — Playwright smoke test against `packages/web-public`.
- **Phase 1:** real speech-recognition behavior requires real devices (cannot be verified remotely — this is the phase that moved the recommended environment to local).
- **Phase 2:** schema/RLS testable via `supabase db push` against a local Docker instance or the real project; verify a second parent's session genuinely cannot read/write another family's rows.
- **Phase 3:** scripted test covering: daily-limit block message when over limit, no lookup/network call triggered when blocked, category block still works, usage increments only on non-blocked outcomes, settings round-trip through Supabase.
- **Phase 4:** manual, on real devices.
