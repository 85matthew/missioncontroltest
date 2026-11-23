---
test_command: node --test
ci_steward_enabled: true
---

# Engineering Conventions

## Stack & Repository Layout
- Zero-dependency vanilla web application using browser-native ES Modules (`"type": "module"` in `package.json`), HTML5 Canvas 2D, CSS3, and Web Audio API.
- `src/config.js` and `src/engine.js` contain pure, DOM-free, deterministic simulation logic and constants.
- `src/sprites.js`, `src/renderer.js`, `src/audio.js`, `src/storage.js`, and `src/main.js` handle Canvas rendering, procedural audio, `localStorage` persistence, and input/animation loop wiring.
- `tests/` contains automated unit and integration tests written with Node's built-in `node:test` and `node:assert/strict` modules.

## Testing & Verification
- Primary test command: `node --test`
- All simulation logic must accept explicit `dtMs` and optional injected `rng` / storage mocks so tests remain 100% deterministic without browser globals.

## Security & Code Quality Rules
- Never use `eval`, `new Function`, `document.write`, `innerHTML`, or `outerHTML`. Always use `textContent` for DOM text updates.
- Keep `index.html` strictly CSP-compatible with no inline `<script>`, `<style>`, or `on*` event attributes, and no external CDN/network requests.
- Validate all `localStorage` payloads defensively with `try/catch` and schema checks before applying state.
- Clamp `requestAnimationFrame` delta times (`<= 50ms`) and ignore `keydown` auto-repeat events (`event.repeat`) for grid hops.

- Specifications: Store feature specs under `specs/<NNN>-<short_id>-<slug>.md`.
