<!-- Copilot instructions for the IronMathEmp repo -->
# Repository Overview

This is a small, static, browser-based math game (Fusion Fast Math) built as ES modules and served from `index.html`. Key files:

- `index.html` — single-page entry that loads `js/auth.js` as the module entrypoint.
- `js/auth.js` — application entry: initializes Firebase auth, wires UI state, and imports `utils`, `backend`, `game`, and `ui`.
- `js/backend.js` — Supabase client + leaderboard/session persistence and caches. Central integration point with server DB.
- `js/game.js` — core game logic: question generation, timing, scoring, session upload.
- `js/ui.js` — UI wiring for leaderboard scope/time buttons.
- `js/utils.js` — small helper library and `FM.GAME_VERSION` constant.

# High-level data flow & boundaries

- Auth/UI (browser) — `auth.js` handles sign-in via Firebase and derives `FM.auth` (player name, email, teacher/student flags).
- Persistence/API — `backend.js` uses a Supabase client (public URL + anon key present in code) to read/write `users`, `sessions`, `questions`, and `leaderboard` tables.
- Game loop — `game.js` runs the gameplay; on game end it calls `backend.insertSessionRow`, `backend.insertQuestionRows`, and `backend.insertLeaderboardRow` (and `updateCachedLeaderboardWithNewScore`) to persist results and update client cache.

Keep these boundaries in mind: editing `game.js` should not assume DB details; use `backend` helpers for persistence. `backend` normalizes DB rows into JS objects (camelCase) before UI rendering.

# Important conventions and patterns

- Global namespace: modules attach to a single global `FastMath` object available as `FM` (e.g. `FM.backend`, `FM.game`, `FM.utils`, `FM.auth`). Prefer using these instead of creating new globals.
- ES module entry: `index.html` loads `js/auth.js` with `type="module"`. Modules import other modules by relative path (e.g., `import "./backend.js"`).
- DOM contract: UI expects specific element IDs (`login-screen`, `emperor-screen`, `game-container`, `end-screen`, `leaderboardContainer`, etc.). Changing IDs requires updating selectors across files.
- DB vs JS naming: DB column names are snake_case (e.g., `questions_answered`, `total_time_seconds`, `date_added`) while code normalizes to camelCase (`questionsAnswered`, `totalTime`, `dateAdded`). Follow the existing mapping pattern in `backend.js` when adding new fields.
- Cache model: `backend.js` maintains separate caches for monthly vs all-time leaderboards (`cachedMonthlyLeaderboard`, `cachedAllTimeLeaderboard`) and exposes `loadLeaderboard(timeFilter, scope, forceRefresh)` and `updateCachedLeaderboardWithNewScore(entry)` to keep UI in sync.
- Error handling: backend helper functions return `{ data, error }` or log to console and return `{ data: null, error }`. Callers (e.g., `game.js`) check the returned structure. Do not assume thrown exceptions everywhere.
- Versioning: `FM.GAME_VERSION` in `js/utils.js` is used in persisted payloads. When changing DB-affecting logic, bump this value.

# Integration points to be aware of

- Firebase OAuth (Microsoft provider) is used in `auth.js`. OAuth state impacts `FM.auth` used by `game.js` and `backend.js`.
- Supabase client is created in `backend.js` with public anon key. All reads/writes go through that client.
- Leaderboard UI actions call `backend.loadLeaderboard(...)` and button handlers are in `js/ui.js`.

# Developer workflows

- No build step: this is a static site of ES modules. To run locally use any static server, for example (PowerShell):

  ```powershell
  # from repo root
  python -m http.server 8000
  # then open http://localhost:8000 in the browser
  ```

- Editing & testing notes:
  - Because Firebase sign-in and Supabase operations use third-party services and OAuth, test sign-in flows on `localhost` (or a configured origin) and watch console logs for API errors.
  - DB schema differences are tolerated: backend helper functions attempt inserts and log failures. Look at `backend.insertSessionRow`, `insertQuestionRows`, and `insertLeaderboardRow` for actual insert patterns.

# Where to make common changes (examples)

- Change UI text/layout: edit `index.html` and `styles.css`.
- Change game difficulty/selection logic: `js/game.js` — see `buildPairs`, `choosePair`, `decayWeightsAndBump`.
- Change leaderboard filtering/sorting logic: `js/backend.js` — `applyLeaderboardFilter`, `renderLeaderboard`, and the `fetch*Leaderboard` functions.
- Add new persisted fields: add normalization in `backend.js` maps, include `version_number: FM.GAME_VERSION` in payloads, and update upload helpers in `game.js` to populate new fields.

# Safety & cautions for AI agents

- Keys in repo: Firebase and Supabase public keys are present for client-side use. Treat them as public (they are anon/publishable) — do not attempt to move them to a server without confirming owner intent.
- Do not change the global `FM` namespace shape without updating all modules. Tests/consumers assume `FM.backend`, `FM.game`, `FM.auth`, `FM.utils` exist.
- Avoid changing DOM IDs or script entrypoint without updating `index.html` and module imports.

# Quick references (paths)

- Entry: `index.html` -> `js/auth.js`
- Backend persistence & caching: `js/backend.js`
- Game logic + uploads: `js/game.js`
- UI leaderboard controls: `js/ui.js`
- Helpers + version: `js/utils.js`

If any section is unclear or you want me to expand examples (e.g., show an example change to `backend.insertLeaderboardRow`), tell me which area and I'll iterate. 
