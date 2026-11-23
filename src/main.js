import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DIRECTIONS,
  GAME_PHASES,
} from "./config.js";
import {
  createInitialState,
  queueHop,
  startNewGame,
  stepSimulation,
  togglePause,
} from "./engine.js";
import {
  SCHEMA_VERSION,
  loadPersistedState,
  savePersistedState,
} from "./storage.js";
import { createSoundEngine } from "./audio.js";
import { createRenderer } from "./renderer.js";

export function clampDeltaMs(rawDtMs) {
  if (typeof rawDtMs !== "number" || !Number.isFinite(rawDtMs)) {
    return 0;
  }
  return Math.min(50, Math.max(0, rawDtMs));
}

export function mapKeyToAction(event) {
  if (!event || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  const key = event.key;
  const code = event.code;

  if (key === "ArrowUp" || key === "w" || key === "W") {
    return { type: "HOP", direction: DIRECTIONS.UP, preventDefault: true };
  }
  if (key === "ArrowDown" || key === "s" || key === "S") {
    return { type: "HOP", direction: DIRECTIONS.DOWN, preventDefault: true };
  }
  if (key === "ArrowLeft" || key === "a" || key === "A") {
    return { type: "HOP", direction: DIRECTIONS.LEFT, preventDefault: true };
  }
  if (key === "ArrowRight" || key === "d" || key === "D") {
    return { type: "HOP", direction: DIRECTIONS.RIGHT, preventDefault: true };
  }
  if (key === "Enter" || key === " " || code === "Space") {
    return { type: "START", preventDefault: key === " " || code === "Space" };
  }
  if (key === "p" || key === "P" || key === "Escape") {
    return { type: "PAUSE", preventDefault: false };
  }
  if (key === "m" || key === "M") {
    return { type: "MUTE", preventDefault: false };
  }
  if (key === "c" || key === "C") {
    return { type: "CRT", preventDefault: false };
  }

  return null;
}

export function createGameController({
  canvas = null,
  elements = {},
  storage,
  soundEngine,
  renderer,
  requestFrame,
  cancelFrame,
  rng = Math.random,
} = {}) {
  const initialPersisted = loadPersistedState(storage);
  let state = createInitialState(initialPersisted.highScore);
  let lastSavedHighScore = initialPersisted.highScore;
  let crtScanlines = initialPersisted.crtScanlines;

  const sound = soundEngine || createSoundEngine({ initialMuted: initialPersisted.muted });
  if (soundEngine && typeof sound.setMuted === "function") {
    sound.setMuted(initialPersisted.muted);
  }

  if (canvas) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
  }
  const activeRenderer = renderer || createRenderer(canvas);

  const raf = requestFrame || (typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null);
  const caf = cancelFrame || (typeof globalThis.cancelAnimationFrame === "function"
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : null);

  let rafId = null;
  let lastTimestampMs = null;
  let lastPhaseAnnounced = null;

  function persistSettingsAndScore() {
    lastSavedHighScore = Math.max(lastSavedHighScore, state.highScore);
    savePersistedState(
      {
        schemaVersion: SCHEMA_VERSION,
        highScore: lastSavedHighScore,
        muted: sound.isMuted(),
        crtScanlines,
      },
      storage
    );
  }

  function syncHighScoreIfNeeded() {
    if (state.highScore > lastSavedHighScore) {
      persistSettingsAndScore();
    }
  }

  function emitAudioEvents(events) {
    for (const eventName of events) {
      sound.play(eventName);
    }
  }

  function syncUi() {
    const { btnStart, btnPause, btnMute, btnCrt, crtStage, srStatus } = elements;
    const isMuted = sound.isMuted();

    if (btnStart) {
      if (state.phase === GAME_PHASES.TITLE) {
        btnStart.textContent = "START";
      } else if (state.phase === GAME_PHASES.GAME_OVER) {
        btnStart.textContent = "RETRY";
      } else {
        btnStart.textContent = "RESTART";
      }
    }

    if (btnPause) {
      const canPause =
        state.phase === GAME_PHASES.PLAYING || state.phase === GAME_PHASES.PAUSED;
      btnPause.disabled = !canPause;
      btnPause.textContent = state.phase === GAME_PHASES.PAUSED ? "RESUME" : "PAUSE";
      btnPause.setAttribute("aria-pressed", String(state.phase === GAME_PHASES.PAUSED));
    }

    if (btnMute) {
      btnMute.textContent = isMuted ? "SOUND: OFF" : "SOUND: ON";
      btnMute.setAttribute("aria-pressed", String(isMuted));
    }

    if (btnCrt) {
      btnCrt.textContent = crtScanlines ? "CRT: ON" : "CRT: OFF";
      btnCrt.setAttribute("aria-pressed", String(crtScanlines));
    }

    if (crtStage && crtStage.classList) {
      crtStage.classList.toggle("crt-enabled", crtScanlines);
    }

    if (srStatus && state.phase !== lastPhaseAnnounced) {
      lastPhaseAnnounced = state.phase;
      if (state.phase === GAME_PHASES.TITLE) {
        srStatus.textContent = "Frogger ready. Press Enter or Space to start.";
      } else if (state.phase === GAME_PHASES.PLAYING) {
        srStatus.textContent = `Playing stage ${state.level}, score ${state.score}, lives ${state.lives}.`;
      } else if (state.phase === GAME_PHASES.PAUSED) {
        srStatus.textContent = "Game paused.";
      } else if (state.phase === GAME_PHASES.ROUND_CLEAR) {
        srStatus.textContent = `Stage ${state.level} clear! Score ${state.score}.`;
      } else if (state.phase === GAME_PHASES.GAME_OVER) {
        srStatus.textContent = `Game over. Final score ${state.score}.`;
      }
    }
  }

  function render(timeMs = 0) {
    if (activeRenderer && typeof activeRenderer.render === "function") {
      activeRenderer.render(state, timeMs);
    }
  }

  function startOrRestart(forceRestart = false) {
    sound.unlock();
    if (
      forceRestart ||
      state.phase === GAME_PHASES.TITLE ||
      state.phase === GAME_PHASES.GAME_OVER
    ) {
      state = startNewGame(state);
      syncUi();
      render(lastTimestampMs ?? 0);
      return true;
    }
    return false;
  }

  function handleHop(direction) {
    sound.unlock();
    const result = queueHop(state, direction);
    state = result.state;
    emitAudioEvents(result.events);
    syncHighScoreIfNeeded();
    return result;
  }

  function handleTogglePause() {
    sound.unlock();
    state = togglePause(state);
    syncUi();
    render(lastTimestampMs ?? 0);
    return state.phase;
  }

  function handleToggleMute() {
    const nextMuted = !sound.isMuted();
    sound.setMuted(nextMuted);
    if (!nextMuted) {
      sound.unlock();
    }
    persistSettingsAndScore();
    syncUi();
    return nextMuted;
  }

  function handleToggleCrt() {
    crtScanlines = !crtScanlines;
    persistSettingsAndScore();
    syncUi();
    return crtScanlines;
  }

  function handleKeyDown(event) {
    const action = mapKeyToAction(event);
    if (!action) {
      return false;
    }
    if (action.preventDefault && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    switch (action.type) {
      case "HOP":
        handleHop(action.direction);
        return true;
      case "START":
        return startOrRestart(false);
      case "PAUSE":
        handleTogglePause();
        return true;
      case "MUTE":
        handleToggleMute();
        return true;
      case "CRT":
        handleToggleCrt();
        return true;
      default:
        return false;
    }
  }

  function stepFrame(timestampMs) {
    const dtMs = lastTimestampMs === null ? 0 : clampDeltaMs(timestampMs - lastTimestampMs);
    lastTimestampMs = timestampMs;

    if (dtMs > 0) {
      const prevPhase = state.phase;
      const result = stepSimulation(state, dtMs, rng);
      state = result.state;
      emitAudioEvents(result.events);
      syncHighScoreIfNeeded();
      if (state.phase !== prevPhase) {
        syncUi();
      }
    }

    render(timestampMs);
  }

  function loopTick(timestampMs) {
    stepFrame(timestampMs);
    if (raf) {
      rafId = raf(loopTick);
    }
  }

  function startLoop() {
    syncUi();
    render(0);
    if (raf && rafId === null) {
      rafId = raf(loopTick);
    }
  }

  function stopLoop() {
    if (caf && rafId !== null) {
      caf(rafId);
      rafId = null;
    }
  }

  syncUi();

  return {
    getState: () => state,
    isCrtEnabled: () => crtScanlines,
    isMuted: () => sound.isMuted(),
    stepFrame,
    startLoop,
    stopLoop,
    startOrRestart,
    handleHop,
    handleTogglePause,
    handleToggleMute,
    handleToggleCrt,
    handleKeyDown,
    syncUi,
    render,
  };
}

export function bindBrowserShell({ doc = globalThis.document, win = globalThis.window } = {}) {
  if (!doc || !win) {
    return null;
  }

  const canvas = doc.getElementById("game-canvas");
  if (!canvas) {
    return null;
  }

  const elements = {
    btnStart: doc.getElementById("btn-start"),
    btnPause: doc.getElementById("btn-pause"),
    btnMute: doc.getElementById("btn-mute"),
    btnCrt: doc.getElementById("btn-crt"),
    crtStage: doc.getElementById("crt-stage"),
    srStatus: doc.getElementById("sr-status"),
  };

  const controller = createGameController({
    canvas,
    elements,
  });

  const onKeyDown = (event) => {
    controller.handleKeyDown(event);
  };
  win.addEventListener("keydown", onKeyDown);

  if (elements.btnStart) {
    elements.btnStart.addEventListener("click", () => {
      controller.startOrRestart(true);
      elements.btnStart.blur();
    });
  }

  if (elements.btnPause) {
    elements.btnPause.addEventListener("click", () => {
      controller.handleTogglePause();
      elements.btnPause.blur();
    });
  }

  if (elements.btnMute) {
    elements.btnMute.addEventListener("click", () => {
      controller.handleToggleMute();
      elements.btnMute.blur();
    });
  }

  if (elements.btnCrt) {
    elements.btnCrt.addEventListener("click", () => {
      controller.handleToggleCrt();
      elements.btnCrt.blur();
    });
  }

  const dpadButtons = doc.querySelectorAll("[data-dir]");
  for (const btn of dpadButtons) {
    const dir = btn.getAttribute("data-dir");
    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      controller.handleHop(dir);
    });
    btn.addEventListener("click", (event) => {
      if (event.detail === 0) {
        controller.handleHop(dir);
      }
    });
  }

  controller.startLoop();
  return controller;
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bindBrowserShell();
    });
  } else {
    bindBrowserShell();
  }
}
