import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEATH_CAUSES,
  DIRECTIONS,
  GAME_PHASES,
  TURTLE_DIVE_STATES,
} from "../src/config.js";
import { createInitialState, startNewGame } from "../src/engine.js";
import { STORAGE_KEY, loadPersistedState } from "../src/storage.js";
import { createSoundEngine } from "../src/audio.js";
import { createRenderer } from "../src/renderer.js";
import { clampDeltaMs, createGameController, mapKeyToAction } from "../src/main.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function createMemoryStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

function createMockAudioContextClass({ resumeRejects = false } = {}) {
  const instances = [];

  class MockAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 1.0;
      this.sampleRate = 22050;
      this.destination = { kind: "destination" };
      this.resumeCalls = 0;
      this.oscillators = [];
      this.bufferSources = [];
      instances.push(this);
    }

    resume() {
      this.resumeCalls += 1;
      if (resumeRejects) {
        return Promise.reject(new Error("Autoplay blocked"));
      }
      this.state = "running";
      return Promise.resolve();
    }

    createOscillator() {
      const osc = {
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTimeCalls: [],
          rampCalls: [],
          setValueAtTime(v, t) {
            this.value = v;
            this.setValueAtTimeCalls.push([v, t]);
          },
          exponentialRampToValueAtTime(v, t) {
            this.rampCalls.push([v, t]);
          },
        },
        connected: false,
        startedAt: null,
        stoppedAt: null,
        connect() {
          this.connected = true;
        },
        start(t) {
          this.startedAt = t;
        },
        stop(t) {
          this.stoppedAt = t;
        },
      };
      this.oscillators.push(osc);
      return osc;
    }

    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }

    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return {
        channels,
        length,
        sampleRate,
        getChannelData() {
          return data;
        },
      };
    }

    createBufferSource() {
      const src = {
        buffer: null,
        startedAt: null,
        stoppedAt: null,
        connect() {},
        start(t) {
          this.startedAt = t;
        },
        stop(t) {
          this.stoppedAt = t;
        },
      };
      this.bufferSources.push(src);
      return src;
    }

    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: {
          setValueAtTime() {},
        },
        connect() {},
      };
    }
  }

  return { MockAudioContext, instances };
}

function createMockCanvasContext() {
  const textCalls = [];
  const rectCalls = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    clearRect(x, y, w, h) {
      rectCalls.push({ op: "clearRect", x, y, w, h });
    },
    fillRect(x, y, w, h) {
      rectCalls.push({ op: "fillRect", x, y, w, h });
    },
    strokeRect(x, y, w, h) {
      rectCalls.push({ op: "strokeRect", x, y, w, h });
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    fillText(text, x, y) {
      textCalls.push({ text: String(text), x, y });
    },
  };
  return {
    canvas: {
      width: 0,
      height: 0,
      getContext(kind) {
        return kind === "2d" ? ctx : null;
      },
    },
    ctx,
    textCalls,
    rectCalls,
  };
}

function createMockElement() {
  const attrs = new Map();
  const classes = new Set();
  return {
    textContent: "",
    disabled: false,
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    classList: {
      toggle(cls, force) {
        if (force === undefined) {
          if (classes.has(cls)) {
            classes.delete(cls);
            return false;
          }
          classes.add(cls);
          return true;
        }
        if (force) {
          classes.add(cls);
        } else {
          classes.delete(cls);
        }
        return Boolean(force);
      },
      contains(cls) {
        return classes.has(cls);
      },
    },
  };
}

test("index.html and src modules enforce strict CSP and zero unsafe DOM/network patterns", () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO_ROOT, "styles/frogger.css"), "utf8");

  assert.match(html, /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["']/i);
  assert.match(html, /<link\s+[^>]*href=["']styles\/frogger\.css["']/i);
  assert.match(
    html,
    /<canvas\s+[^>]*id=["']game-canvas["'][^>]*width=["']672["'][^>]*height=["']728["']/i
  );
  assert.match(html, /<script\s+type=["']module["']\s+src=["']src\/main\.js["']><\/script>/i);

  // Required interactive controls and touch D-pad
  for (const id of ["btn-start", "btn-pause", "btn-mute", "btn-crt", "crt-stage"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html missing id=${id}`);
  }
  for (const dir of ["UP", "DOWN", "LEFT", "RIGHT"]) {
    assert.ok(html.includes(`data-dir="${dir}"`), `index.html missing data-dir=${dir}`);
  }

  // Zero inline scripts, inline styles, inline on* handlers, or external URLs
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scriptTags.length, 1);
  assert.equal(scriptTags[0][2].trim(), "");
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(css, /https?:\/\//i);

  const srcDir = path.join(REPO_ROOT, "src");
  const srcFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));
  assert.deepEqual(
    srcFiles.sort(),
    ["audio.js", "config.js", "engine.js", "main.js", "renderer.js", "sprites.js", "storage.js"]
  );

  const forbiddenPatterns = [
    /\beval\s*\(/,
    /\bnew\s+Function\b/,
    /\bdocument\.write\b/,
    /\.innerHTML\b/,
    /\.outerHTML\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
  ];

  for (const file of srcFiles) {
    const content = fs.readFileSync(path.join(srcDir, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${file} matched forbidden pattern ${pattern}`);
    }
  }
});

test("audio synthesizer initializes lazily, plays all game events, respects mute, and falls back silently", () => {
  // Missing AudioContext falls back safely to no-op
  const headlessAudio = createSoundEngine({ AudioContextClass: null });
  assert.equal(headlessAudio.unlock(), false);
  assert.equal(headlessAudio.isMuted(), false);
  headlessAudio.play("hop");
  headlessAudio.setMuted(true);
  assert.equal(headlessAudio.isMuted(), true);
  headlessAudio.play("splash");

  // Throwing AudioContext fails silently without throwing
  class BrokenAudioContext {
    constructor() {
      throw new Error("AudioContext blocked");
    }
  }
  const brokenAudio = createSoundEngine({ AudioContextClass: BrokenAudioContext });
  assert.equal(brokenAudio.unlock(), false);
  brokenAudio.play("splat");

  // Mock AudioContext verifies lazy creation, resume, mute gating, and all 9 event tokens
  const { MockAudioContext, instances } = createMockAudioContextClass({ resumeRejects: true });
  const sound = createSoundEngine({ AudioContextClass: MockAudioContext });
  assert.equal(instances.length, 0, "AudioContext must not be constructed until user interaction");

  sound.setMuted(true);
  sound.play("hop");
  assert.equal(instances.length, 0, "Muted play() should not initialize AudioContext");

  assert.equal(sound.unlock(), true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].resumeCalls, 1);

  sound.play("hop");
  assert.equal(instances[0].oscillators.length, 0, "Muted play() must not schedule oscillators");

  sound.setMuted(false);
  const allEvents = [
    "hop",
    "splash",
    "splat",
    "home",
    "bonus",
    "roundClear",
    "extraLife",
    "timeWarn",
    "gameOver",
  ];
  for (const eventName of allEvents) {
    const beforeCount = instances[0].oscillators.length;
    sound.play(eventName);
    assert.ok(
      instances[0].oscillators.length > beforeCount,
      `expected oscillator nodes for event ${eventName}`
    );
  }
  sound.play("unknownEvent");
});

test("canvas renderer draws all game phases, wrapping entities, diving turtles, and home bays", () => {
  const { canvas, textCalls, rectCalls } = createMockCanvasContext();
  const renderer = createRenderer(canvas);

  const titleState = createInitialState(1200);
  renderer.render(titleState, 0);
  assert.ok(textCalls.some((c) => c.text === "FROGGER"));
  assert.ok(textCalls.some((c) => c.text === "001200"));
  assert.ok(rectCalls.some((c) => c.op === "clearRect" && c.w === CANVAS_WIDTH && c.h === CANVAS_HEIGHT));

  const playingState = startNewGame(titleState);
  playingState.homeBays[0].occupied = true;
  playingState.homeBays[1].hasFly = true;
  // Force a log to wrap over the right boundary and a turtle to be SINK_WARN / SUBMERGED
  playingState.lanes[0].entities[0].x = playingState.lanes[0].wrapWidth - 1.5;
  playingState.lanes[1].entities[0].diveState = TURTLE_DIVE_STATES.SINK_WARN;
  playingState.lanes[1].entities[2].diveState = TURTLE_DIVE_STATES.SUBMERGED;
  playingState.timeRemainingMs = 4000;

  textCalls.length = 0;
  renderer.render(playingState, 250);
  assert.ok(textCalls.some((c) => c.text === "TIME 04"));

  const pausedState = { ...playingState, phase: GAME_PHASES.PAUSED };
  textCalls.length = 0;
  renderer.render(pausedState, 300);
  assert.ok(textCalls.some((c) => c.text === "PAUSED"));

  const drownedState = {
    ...playingState,
    phase: GAME_PHASES.DYING,
    deathCause: DEATH_CAUSES.DROWNED,
  };
  renderer.render(drownedState, 350);

  const roadkillState = {
    ...playingState,
    phase: GAME_PHASES.DYING,
    deathCause: DEATH_CAUSES.ROADKILL,
  };
  renderer.render(roadkillState, 400);

  const clearState = { ...playingState, phase: GAME_PHASES.ROUND_CLEAR };
  textCalls.length = 0;
  renderer.render(clearState, 450);
  assert.ok(textCalls.some((c) => c.text.includes("CLEAR!")));

  const gameOverState = {
    ...playingState,
    phase: GAME_PHASES.GAME_OVER,
    score: 2500,
    highScore: 2500,
  };
  textCalls.length = 0;
  renderer.render(gameOverState, 900);
  assert.ok(textCalls.some((c) => c.text === "GAME OVER"));
  assert.ok(textCalls.some((c) => c.text === "NEW HI-SCORE!"));
});

test("clampDeltaMs and mapKeyToAction enforce delta clamping and anti-auto-repeat rules", () => {
  assert.equal(clampDeltaMs(-10), 0);
  assert.equal(clampDeltaMs(Number.NaN), 0);
  assert.equal(clampDeltaMs(16.5), 16.5);
  assert.equal(clampDeltaMs(50), 50);
  assert.equal(clampDeltaMs(4200), 50);

  assert.deepEqual(mapKeyToAction({ key: "ArrowUp", repeat: false }), {
    type: "HOP",
    direction: DIRECTIONS.UP,
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: "w", repeat: false }), {
    type: "HOP",
    direction: DIRECTIONS.UP,
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: "S", repeat: false }), {
    type: "HOP",
    direction: DIRECTIONS.DOWN,
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: "a", repeat: false }), {
    type: "HOP",
    direction: DIRECTIONS.LEFT,
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: "ArrowRight", repeat: false }), {
    type: "HOP",
    direction: DIRECTIONS.RIGHT,
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: " ", code: "Space", repeat: false }), {
    type: "START",
    preventDefault: true,
  });
  assert.deepEqual(mapKeyToAction({ key: "Enter", repeat: false }), {
    type: "START",
    preventDefault: false,
  });
  assert.deepEqual(mapKeyToAction({ key: "p", repeat: false }), {
    type: "PAUSE",
    preventDefault: false,
  });
  assert.deepEqual(mapKeyToAction({ key: "Escape", repeat: false }), {
    type: "PAUSE",
    preventDefault: false,
  });
  assert.deepEqual(mapKeyToAction({ key: "m", repeat: false }), {
    type: "MUTE",
    preventDefault: false,
  });
  assert.deepEqual(mapKeyToAction({ key: "c", repeat: false }), {
    type: "CRT",
    preventDefault: false,
  });

  // Auto-repeat and modifier shortcuts must be ignored
  assert.equal(mapKeyToAction({ key: "ArrowUp", repeat: true }), null);
  assert.equal(mapKeyToAction({ key: "r", ctrlKey: true, repeat: false }), null);
  assert.equal(mapKeyToAction({ key: "w", metaKey: true, repeat: false }), null);
});

test("createGameController integrates input, rAF delta clamping, audio events, and storage persistence", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      highScore: 0,
      muted: false,
      crtScanlines: true,
    }),
  });
  const { canvas } = createMockCanvasContext();
  const elements = {
    btnStart: createMockElement(),
    btnPause: createMockElement(),
    btnMute: createMockElement(),
    btnCrt: createMockElement(),
    crtStage: createMockElement(),
    srStatus: createMockElement(),
  };

  const playedEvents = [];
  let unlocked = 0;
  let mutedFlag = false;
  const mockAudio = {
    unlock() {
      unlocked += 1;
    },
    setMuted(v) {
      mutedFlag = Boolean(v);
    },
    isMuted() {
      return mutedFlag;
    },
    play(ev) {
      playedEvents.push(ev);
    },
  };

  const controller = createGameController({
    canvas,
    elements,
    storage,
    soundEngine: mockAudio,
    rng: () => 0.1,
  });

  assert.equal(canvas.width, CANVAS_WIDTH);
  assert.equal(canvas.height, CANVAS_HEIGHT);
  assert.equal(elements.crtStage.classList.contains("crt-enabled"), true);
  assert.equal(elements.btnCrt.textContent, "CRT: ON");
  assert.equal(elements.btnStart.textContent, "START");
  assert.equal(elements.btnPause.disabled, true);

  // Start game via Enter key
  let prevented = false;
  controller.handleKeyDown({
    key: " ",
    code: "Space",
    repeat: false,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(unlocked, 1);
  assert.equal(controller.getState().phase, GAME_PHASES.PLAYING);
  assert.equal(elements.btnPause.disabled, false);

  // Hop left onto safe curb x=6 first so row 11 buggy at x=8 is clear when hopping up
  controller.handleKeyDown({ key: "ArrowLeft", repeat: false });
  assert.equal(controller.getState().frog.hopping, true);
  controller.stepFrame(10);
  controller.stepFrame(60);
  controller.stepFrame(100);
  assert.equal(controller.getState().frog.hopping, false);
  assert.equal(controller.getState().frog.x, 6);

  // Repeat keydown must be ignored
  controller.handleKeyDown({ key: "ArrowUp", repeat: true });
  assert.equal(controller.getState().frog.hopping, false);

  // Valid hop up emits "hop" and awards +10 forward score (updating persisted high score)
  controller.handleKeyDown({ key: "ArrowUp", repeat: false });
  assert.equal(controller.getState().frog.hopping, true);
  assert.equal(controller.getState().score, 10);
  assert.deepEqual(playedEvents, ["hop", "hop"]);
  assert.equal(loadPersistedState(storage).highScore, 10);

  // Large background-tab delta between frames is clamped to 50ms (hop takes 90ms, so still mid-hop!)
  controller.stepFrame(10000);
  assert.equal(controller.getState().frog.hopping, true);
  assert.equal(controller.getState().frog.hopElapsedMs, 50);

  // Next 50ms completes the 90ms hop
  controller.stepFrame(10050);
  assert.equal(controller.getState().frog.hopping, false);
  assert.equal(controller.getState().frog.row, 11);

  // Pause & resume via P key
  controller.handleKeyDown({ key: "p", repeat: false });
  assert.equal(controller.getState().phase, GAME_PHASES.PAUSED);
  assert.equal(elements.btnPause.textContent, "RESUME");
  controller.handleKeyDown({ key: "Escape", repeat: false });
  assert.equal(controller.getState().phase, GAME_PHASES.PLAYING);

  // Mute and CRT toggles persist to storage and update DOM textContent
  controller.handleKeyDown({ key: "m", repeat: false });
  assert.equal(controller.isMuted(), true);
  assert.equal(elements.btnMute.textContent, "SOUND: OFF");

  controller.handleKeyDown({ key: "c", repeat: false });
  assert.equal(controller.isCrtEnabled(), false);
  assert.equal(elements.crtStage.classList.contains("crt-enabled"), false);

  assert.deepEqual(loadPersistedState(storage), {
    schemaVersion: 1,
    highScore: 10,
    muted: true,
    crtScanlines: false,
  });
});
