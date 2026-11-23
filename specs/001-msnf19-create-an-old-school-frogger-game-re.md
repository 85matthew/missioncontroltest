# Old-School Frogger Browser Replica

- **Mission ID:** `msn-f19f888c`
- **Spec Slug:** `001-msnf19-create-an-old-school-frogger-game-re`
- **Repository:** `85matthew/missioncontroltest`

## Problem & Scope

The repository currently contains only a placeholder [README.md](file:///README.md) with no application source code, governance files, or test suite. This specification defines an authentic, 1981-inspired **Frogger** arcade game replica playable directly in modern desktop and mobile web browsers with zero build step and zero external runtime or npm dependencies.

### In-Scope Deliverables
- **14×13 Classic Arcade Grid Playfield:**
  - `Row 0`: Goal bank containing 5 symmetric Home Bays centered at `x = [1.0, 4.0, 7.0, 10.0, 13.0]` separated by lethal riverbank foliage.
  - `Rows 1–5`: 5-lane River zone featuring wrapping floating logs and 3-state diving turtle groups (`SURFACE` → `SINK_WARN` → `SUBMERGED`).
  - `Row 6`: Median safe curb strip (zero hazards).
  - `Rows 7–11`: 5-lane Road zone featuring wrapping trucks, race cars, sedans, bulldozers, and dune buggies with distinct speeds and widths.
  - `Row 12`: Start curb strip (frog spawns at `x = 7`, `row = 12`).
- **Authentic Arcade Rules & Progression:**
  - Discrete 1-tile directional hopping (`Arrow*` / `WASD` + touch D-pad) with smooth 90ms visual interpolation and anti-auto-repeat input gating.
  - Forward-progress scoring (`+10` per new highest row reached per life/bay attempt), Home Bay completion (`+50` + `+10` per whole second remaining on the 30s timer), periodic Bonus Fly (`+200`), full-round clear (`+1000` and speed scaling for `level + 1`), and one-time extra life at `20,000` points.
  - Explicit game finite state machine (`TITLE`, `PLAYING`, `PAUSED`, `DYING`, `ROUND_CLEAR`, `GAME_OVER`), 3 starting lives, and a 30-second per-frog countdown timer.
- **Self-Contained Browser Presentation & Audio:**
  - Procedural HTML5 Canvas 2D pixel/vector-retro sprites (`672×728` logical resolution scaled responsively via CSS) with optional subtle CRT scanline overlay.
  - Procedural Web Audio API chiptune sound effects (hop, splash, road splat, home bay, bonus fly, round clear, low-time warning, game over) with mute toggle and graceful degradation when `AudioContext` is unavailable.
  - Schema-validated `localStorage` persistence for `HI-SCORE`, `muted`, and `crtScanlines`.
- **Automated Verification:** Pure ES module simulation logic (`src/config.js`, `src/engine.js`, `src/storage.js`) fully tested via Node's built-in `node:test` runner (`node --test`).

### Out-of-Scope
- Server-side backends, multiplayer networking, online leaderboards, or user accounts.
- External CDN assets (fonts, images, audio files) or bundler toolchains (Webpack/Vite/TypeScript compilation).

## Invariants & Security Rules

1. **Pure Simulation / Browser I/O Separation:**
   - `src/config.js` and `src/engine.js` MUST remain 100% DOM-free, `window`-free, and deterministic given explicit `(state, dtMs, rng)` inputs so all simulation rules execute identically in browsers and headless `node --test`.
   - `requestAnimationFrame` delta times in `src/main.js` MUST be clamped (`dtMs = Math.min(50, Math.max(0, rawDtMs))`) to prevent physics tunneling when a browser tab resumes from background sleep.
2. **Grid, Collision, and Movement Invariants:**
   - **No Overlapping Spawns:** Within every lane in `src/config.js`, adjacent entities MUST maintain positive horizontal separation (`gap >= 0.8` tiles) across the `wrapWidth`.
   - **Non-Farmable Forward Score:** `frog.minRowReached` tracks the lowest row index (closest to `0`) reached in the current attempt; `+10` points are awarded strictly when `targetRow < frog.minRowReached`.
   - **River Survival Invariant:** While on `Rows 1–5` (`!frog.hopping`), the frog MUST overlap a non-submerged `LOG` or `TURTLE_GROUP` (`diveState !== "SUBMERGED"`) within horizontal hitbox tolerance (`0.15` tiles inset); while riding, the frog's `x` translates by `lane.direction * lane.baseSpeed * levelMultiplier * (dtMs / 1000)` and drowns (`OUT_OF_BOUNDS`) if `x < -0.25` or `x > 13.25`.
   - **Home Bay Exclusivity:** Landing on `Row 0` succeeds only if `|frog.x - bay.centerX| <= 0.65` and `!bay.occupied`; landing on riverbank foliage or an already-occupied bay triggers `DYING` (`BANK_COLLISION`).
   - **Speed Cap:** `levelSpeedMultiplier = Math.min(2.2, 1 + (level - 1) * 0.12)` prevents impossible high-level velocities.
3. **Client-Side Security & Hygiene:**
   - **Zero Unsafe DOM Sinks:** All DOM text updates MUST use `element.textContent`; `innerHTML`, `outerHTML`, `document.write`, `eval`, and `new Function` are strictly prohibited.
   - **Strict Static CSP Compatibility:** `index.html` MUST NOT contain inline `<script>` blocks, inline `<style>` blocks, or inline `on*` event attributes.
   - **Defensive `localStorage` Validation:** `src/storage.js` MUST wrap storage access in `try/catch` and validate every field against `PersistedSettingsAndScore` (`schemaVersion === 1`, finite integer `0 <= highScore <= 9999999`, boolean `muted` and `crtScanlines`), resetting invalid payloads safely to defaults without throwing.
   - **No Network Calls or Secrets:** The application makes zero `fetch`/`XMLHttpRequest`/`WebSocket` calls and stores no credentials or PII.
4. **Input & Audio Safety:**
   - Keydown events with `event.repeat === true` MUST be ignored during `PLAYING` so holding a key does not skip lanes uncontrollably.
   - Web Audio initialization MUST occur lazily on user interaction and fail silently to no-op if `AudioContext` / `webkitAudioContext` is blocked or missing.

## Interface & Schema Contracts

Canonical JSON Schema definitions are published in [game-state.schema.json](file:///specs/001-msnf19-create-an-old-school-frogger-game-re/game-state.schema.json).

### 1. Simulation State (`FroggerGameState`)
- Top-level fields: `phase`, `score`, `highScore`, `lives`, `level`, `extraLifeAwarded`, `timeRemainingMs`, `timeLimitMs`, `phaseTimerMs`, `deathCause`, `flySpawnCooldownMs`, `frog`, `lanes` (10 lanes: rows `1–5` `RIVER`, rows `7–11` `ROAD`), `homeBays` (5 bays).
- `GamePhase` enum: `"TITLE" | "PLAYING" | "PAUSED" | "DYING" | "ROUND_CLEAR" | "GAME_OVER"`.
- `DeathCause` enum: `"ROADKILL" | "DROWNED" | "BANK_COLLISION" | "TIMEOUT" | "OUT_OF_BOUNDS" | null`.

### 2. Core Engine Module API (`src/engine.js`)
- `createInitialState(persistedHighScore?: number): FroggerGameState` — returns a fresh `TITLE` state with `highScore` initialized safely.
- `startNewGame(state: FroggerGameState): FroggerGameState` — resets `score = 0`, `lives = 3`, `level = 1`, clears all 5 bays, spawns frog at `(7, 12)`, sets `phase = "PLAYING"`, `timeRemainingMs = 30000`.
- `togglePause(state: FroggerGameState): FroggerGameState` — toggles between `"PLAYING"` and `"PAUSED"`; no-op in other phases.
- `queueHop(state: FroggerGameState, direction: "UP" | "DOWN" | "LEFT" | "RIGHT"): { state: FroggerGameState, events: string[] }` — initiates a 1-tile hop if `phase === "PLAYING"` and `!frog.hopping`, clamps `LEFT`/`RIGHT`/`DOWN` within `[0..13]` / `[0..12]`, awards `+10` on new `minRowReached`, and emits `"hop"` event.
- `stepSimulation(state: FroggerGameState, dtMs: number, rng?: () => number): { state: FroggerGameState, events: string[] }` — advances lane entities, turtle dive timers, bonus fly spawn/expiry, active hop interpolation, frog timer, collisions, and phase transitions; returns updated state plus discrete event tokens (`"hop"`, `"splash"`, `"splat"`, `"home"`, `"bonus"`, `"roundClear"`, `"extraLife"`, `"timeWarn"`, `"gameOver"`) consumed by `audio.js`.

### 3. Persistence Contract (`src/storage.js` / `PersistedSettingsAndScore`)
- Storage key: `"frogger_arcade_v1"`.
- Schema: `{ "schemaVersion": 1, "highScore": 0..9999999, "muted": boolean, "crtScanlines": boolean }`.
- `loadPersistedState(storageLike?)` and `savePersistedState(payload, storageLike?)` accept an injectable storage mock for unit tests and fall back to `globalThis.localStorage`.

### 4. Browser Shell & Canvas Contract (`index.html`, `src/renderer.js`, `src/audio.js`)
- Logical canvas dimensions: `672 × 728` (`14 * 48` width; `56px` top HUD + `13 * 48 = 624px` playfield + `48px` bottom HUD).
- Keyboard controls: `ArrowUp`/`W`, `ArrowDown`/`S`, `ArrowLeft`/`A`, `ArrowRight`/`D` (move), `Enter`/`Space` (start from `TITLE` or restart from `GAME_OVER`), `P`/`Escape` (pause/resume), `M` (toggle mute).
- Audio controller `createSoundEngine({ AudioContextClass })` exposes `{ play(eventName), setMuted(muted), isMuted(), unlock() }`.

## Implementation Milestones

### M1: Project Scaffolding, Arcade Grid, Constants, and Schema-Validated Storage
- **Target Files:** `package.json`, `src/config.js`, `src/storage.js`, `tests/config-and-storage.test.js`
- **Scope:** Initialize zero-dependency ESM `package.json` (`"type": "module"`, `"test": "node --test"`). Define immutable grid geometry, 5 Home Bay coordinates, 10 lane specifications, scoring/timer constants, and schema-validated `localStorage` persistence with mockable storage adapter.
- **Verify Command:** `node --test tests/config-and-storage.test.js`

### M2: Pure Simulation Engine — Frog Movement, Lane Wrapping, Turtle Diving, and Collision Detection
- **Target Files:** `src/engine.js`, `tests/engine-movement-collision.test.js`
- **Scope:** Implement state creation, discrete 1-tile hopping with interpolation and boundary clamping, lane entity wrapping with level speed scaling, 3-state turtle diving cycle, road vehicle AABB collision detection, and river platform riding / drowning / drift-off detection.
- **Verify Command:** `node --test tests/engine-movement-collision.test.js`

### M3: Home Bays, Bonus Fly, Timer, Scoring, Lives, and Level Progression
- **Target Files:** `src/engine.js`, `tests/engine-scoring-progression.test.js`
- **Scope:** Implement Home Bay landing and bush/occupied-bay collision, deterministic Bonus Fly spawning and `+200` pickup, 30-second countdown timer and timeout death, forward-progress non-farmable scoring, extra life at `20,000` points, life decrement and `GAME_OVER`, and 5-bay `ROUND_CLEAR` → `level + 1` progression.
- **Verify Command:** `node --test tests/engine-scoring-progression.test.js`

### M4: Retro Canvas Renderer, Procedural Web Audio Synthesizer, Browser Shell, and Integration Tests
- **Target Files:** `index.html`, `styles/frogger.css`, `src/sprites.js`, `src/renderer.js`, `src/audio.js`, `src/main.js`, `tests/browser-shell-and-audio.test.js`
- **Scope:** Build the CSP-safe responsive HTML5 Canvas arcade cabinet shell with touch D-pad and CRT scanline toggle, procedural pixel/retro sprite rendering for all entities and HUD overlays, procedural Web Audio chiptune synthesizer with safe headless fallback, `requestAnimationFrame` loop with input anti-repeat, and structural/integration verification tests.
- **Verify Command:** `node --test`

## Acceptance Criteria

1. **Automated Test Suite Passes:** Running `node --test` exits `0` with all unit and integration tests passing across `tests/config-and-storage.test.js`, `tests/engine-movement-collision.test.js`, `tests/engine-scoring-progression.test.js`, and `tests/browser-shell-and-audio.test.js`.
2. **Authentic Grid & Lane Invariants Verified:** All 10 lanes (`rows 1–5` river, `rows 7–11` road) wrap seamlessly around `wrapWidth` with positive entity gaps (`>= 0.8` tiles), and the 5 Home Bays sit symmetrically at `x = [1.0, 4.0, 7.0, 10.0, 13.0]`.
3. **Gameplay Rules Verified Deterministically:**
   - Moving into a road vehicle sets `phase = "DYING"`, `deathCause = "ROADKILL"`, and decrements `lives` after the death timer.
   - Moving onto water without an active non-submerged platform, onto a `SUBMERGED` turtle, or drifting off-screen sets `phase = "DYING"` (`DROWNED` / `OUT_OF_BOUNDS`).
   - Riding a floating log or surfaced turtle shifts `frog.x` smoothly at the platform's exact velocity.
   - Forward hops award `+10` strictly once per new `minRowReached`; reaching an empty bay awards `+50 + timeSeconds * 10` (plus `+200` if `hasFly`); filling all 5 bays awards `+1000`, triggers `ROUND_CLEAR`, and advances `level` with scaled speeds.
   - Timer reaching `0` triggers `TIMEOUT` death; reaching `0` lives transitions to `GAME_OVER` while updating `highScore`.
4. **Persistence & Security Verified:** `src/storage.js` rejects/resets malformed JSON, negative or non-integer `highScore`, and wrong `schemaVersion` without throwing; `index.html` contains zero inline `<script>` tags, zero inline `on*` attributes, and zero external network asset URLs; `src/` contains zero `eval`/`innerHTML` calls.
5. **Browser Playability:** Serving the repository over any static HTTP server (e.g., `python3 -m http.server`) renders the playable Frogger arcade canvas, responds to keyboard (`Arrow*`, `WASD`, `Enter`/`Space`, `P`/`Escape`, `M`) and touch D-pad controls, plays synthesized Web Audio sound effects when unmuted, and persists high scores across reloads.
