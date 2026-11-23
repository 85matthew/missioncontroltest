import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEATH_CAUSES,
  DIRECTIONS,
  ENTITY_KINDS,
  FROG_CONFIG,
  GAME_PHASES,
  GRID_COLS,
  GRID_ROWS,
  HOME_BAY_CENTERS,
  HOME_BAY_TOLERANCE,
  HUD_BOTTOM_HEIGHT,
  HUD_TOP_HEIGHT,
  LANE_SPECS,
  LANE_ZONES,
  MIN_ENTITY_GAP,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  PROGRESSION,
  ROWS,
  SCORING,
  TILE_SIZE,
  TIMERS,
  TURTLE_DIVE_STATES,
  getLevelSpeedMultiplier,
} from "../src/config.js";

import {
  DEFAULT_PERSISTED_STATE,
  STORAGE_KEY,
  isValidPersistedState,
  loadPersistedState,
  savePersistedState,
} from "../src/storage.js";

function createMemoryStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

test("grid, canvas, home bay, and frog constants match arcade specification", () => {
  assert.equal(GRID_COLS, 14);
  assert.equal(GRID_ROWS, 13);
  assert.equal(TILE_SIZE, 48);
  assert.equal(HUD_TOP_HEIGHT, 56);
  assert.equal(HUD_BOTTOM_HEIGHT, 48);
  assert.equal(PLAYFIELD_WIDTH, 672);
  assert.equal(PLAYFIELD_HEIGHT, 624);
  assert.equal(CANVAS_WIDTH, 672);
  assert.equal(CANVAS_HEIGHT, 728);

  assert.deepEqual(HOME_BAY_CENTERS, [1.0, 4.0, 7.0, 10.0, 13.0]);
  assert.equal(HOME_BAY_TOLERANCE, 0.65);

  assert.equal(ROWS.GOAL_BANK, 0);
  assert.equal(ROWS.RIVER_MIN, 1);
  assert.equal(ROWS.RIVER_MAX, 5);
  assert.equal(ROWS.MEDIAN, 6);
  assert.equal(ROWS.ROAD_MIN, 7);
  assert.equal(ROWS.ROAD_MAX, 11);
  assert.equal(ROWS.START, 12);

  assert.equal(FROG_CONFIG.SPAWN_X, 7);
  assert.equal(FROG_CONFIG.SPAWN_ROW, 12);
  assert.equal(FROG_CONFIG.HOP_DURATION_MS, 90);
  assert.equal(FROG_CONFIG.RIVER_HITBOX_INSET, 0.15);
  assert.equal(FROG_CONFIG.OUT_OF_BOUNDS_MIN_X, -0.25);
  assert.equal(FROG_CONFIG.OUT_OF_BOUNDS_MAX_X, 13.25);
});

test("exported enums, scoring, timers, and lane specs are deeply frozen", () => {
  assert.equal(Object.isFrozen(GAME_PHASES), true);
  assert.equal(Object.isFrozen(DIRECTIONS), true);
  assert.equal(Object.isFrozen(DEATH_CAUSES), true);
  assert.equal(Object.isFrozen(TURTLE_DIVE_STATES), true);
  assert.equal(Object.isFrozen(ENTITY_KINDS), true);
  assert.equal(Object.isFrozen(HOME_BAY_CENTERS), true);
  assert.equal(Object.isFrozen(SCORING), true);
  assert.equal(Object.isFrozen(TIMERS), true);
  assert.equal(Object.isFrozen(LANE_SPECS), true);
  assert.equal(Object.isFrozen(LANE_SPECS[0]), true);
  assert.equal(Object.isFrozen(LANE_SPECS[0].entities), true);
  assert.equal(Object.isFrozen(LANE_SPECS[0].entities[0]), true);
});

test("scoring, timer, and level speed multiplier constants match specification", () => {
  assert.equal(SCORING.FORWARD_HOP, 10);
  assert.equal(SCORING.HOME_BAY, 50);
  assert.equal(SCORING.TIME_BONUS_PER_SECOND, 10);
  assert.equal(SCORING.BONUS_FLY, 200);
  assert.equal(SCORING.ROUND_CLEAR, 1000);
  assert.equal(SCORING.EXTRA_LIFE_THRESHOLD, 20000);
  assert.equal(SCORING.MAX_SCORE, 9999999);

  assert.equal(TIMERS.FROG_TIME_LIMIT_MS, 30000);
  assert.equal(PROGRESSION.STARTING_LIVES, 3);

  assert.equal(getLevelSpeedMultiplier(1), 1);
  assert.ok(Math.abs(getLevelSpeedMultiplier(2) - 1.12) < 1e-9);
  assert.ok(Math.abs(getLevelSpeedMultiplier(5) - 1.48) < 1e-9);
  assert.equal(getLevelSpeedMultiplier(11), 2.2);
  assert.equal(getLevelSpeedMultiplier(25), 2.2);
});

test("all 10 lanes maintain wrapWidth >= 14, non-overlapping entities, and wrap gap >= 0.8", () => {
  assert.equal(LANE_SPECS.length, 10);

  const riverRows = LANE_SPECS.filter((l) => l.zone === LANE_ZONES.RIVER).map((l) => l.row);
  const roadRows = LANE_SPECS.filter((l) => l.zone === LANE_ZONES.ROAD).map((l) => l.row);
  assert.deepEqual(riverRows, [1, 2, 3, 4, 5]);
  assert.deepEqual(roadRows, [7, 8, 9, 10, 11]);

  const seenIds = new Set();
  const roadKinds = new Set();
  const roadSpeeds = new Set();
  const roadWidths = new Set();
  let divingTurtleCount = 0;

  for (const lane of LANE_SPECS) {
    assert.ok(lane.wrapWidth >= 14, `lane row ${lane.row} wrapWidth >= 14`);
    assert.ok(lane.baseSpeed > 0, `lane row ${lane.row} baseSpeed > 0`);
    assert.ok(lane.direction === 1 || lane.direction === -1);
    assert.ok(lane.entities.length >= 2, `lane row ${lane.row} has >= 2 entities`);

    const sorted = [...lane.entities].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i += 1) {
      const entity = sorted[i];
      assert.equal(seenIds.has(entity.id), false, `duplicate entity id ${entity.id}`);
      seenIds.add(entity.id);

      assert.ok(entity.x >= 0 && entity.x < lane.wrapWidth);
      assert.ok(entity.width > 0);
      assert.equal(typeof entity.dives, "boolean");
      assert.equal(entity.diveState, TURTLE_DIVE_STATES.SURFACE);
      assert.ok(entity.diveTimerMs >= 0);

      if (entity.kind === ENTITY_KINDS.TURTLE_GROUP && entity.dives) {
        divingTurtleCount += 1;
      }

      if (lane.zone === LANE_ZONES.ROAD) {
        roadKinds.add(entity.kind);
        roadSpeeds.add(lane.baseSpeed);
        roadWidths.add(entity.width);
      }

      const next = sorted[(i + 1) % sorted.length];
      const nextStart = i + 1 < sorted.length ? next.x : next.x + lane.wrapWidth;
      const gap = nextStart - (entity.x + entity.width);
      assert.ok(
        gap >= MIN_ENTITY_GAP,
        `lane row ${lane.row} gap between ${entity.id} and ${next.id} is ${gap} (< ${MIN_ENTITY_GAP})`
      );
    }
  }

  assert.ok(divingTurtleCount >= 2, "river contains diving turtle groups");
  assert.deepEqual(
    [...roadKinds].sort(),
    [
      ENTITY_KINDS.BUGGY,
      ENTITY_KINDS.BULLDOZER,
      ENTITY_KINDS.RACE_CAR,
      ENTITY_KINDS.SEDAN,
      ENTITY_KINDS.TRUCK,
    ].sort()
  );
  assert.equal(roadSpeeds.size, 5, "all 5 road lanes have distinct speeds");
  assert.equal(roadWidths.size, 5, "all 5 road lanes have distinct vehicle widths");
});

test("storage loads defaults when empty or missing global localStorage", () => {
  const emptyStorage = createMemoryStorage();
  const loaded = loadPersistedState(emptyStorage);
  assert.deepEqual(loaded, DEFAULT_PERSISTED_STATE);
  assert.notEqual(loaded, DEFAULT_PERSISTED_STATE);

  loaded.highScore = 1234;
  assert.equal(DEFAULT_PERSISTED_STATE.highScore, 0);

  const fallbackLoaded = loadPersistedState();
  assert.deepEqual(fallbackLoaded, DEFAULT_PERSISTED_STATE);
});

test("storage saves and loads valid PersistedSettingsAndScore payloads", () => {
  const mockStorage = createMemoryStorage();
  const payload = {
    schemaVersion: 1,
    highScore: 42500,
    muted: true,
    crtScanlines: true,
  };

  assert.equal(isValidPersistedState(payload), true);
  assert.equal(savePersistedState(payload, mockStorage), true);

  const raw = mockStorage.getItem(STORAGE_KEY);
  assert.equal(typeof raw, "string");
  assert.deepEqual(JSON.parse(raw), payload);

  const loaded = loadPersistedState(mockStorage);
  assert.deepEqual(loaded, payload);
});

test("storage rejects and resets malformed JSON, invalid highScore, wrong schemaVersion, and extra properties", () => {
  const invalidPayloads = [
    "{not valid json",
    "null",
    "[]",
    JSON.stringify({ schemaVersion: 2, highScore: 100, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 0, highScore: 100, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: "1", highScore: 100, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: -10, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: 12.5, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: 10000000, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: "100", muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: null, muted: false, crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: 100, muted: "yes", crtScanlines: false }),
    JSON.stringify({ schemaVersion: 1, highScore: 100, muted: false, crtScanlines: 1 }),
    JSON.stringify({ schemaVersion: 1, highScore: 100, muted: false }),
    JSON.stringify({
      schemaVersion: 1,
      highScore: 100,
      muted: false,
      crtScanlines: false,
      extra: true,
    }),
  ];

  for (const raw of invalidPayloads) {
    const mockStorage = createMemoryStorage({ [STORAGE_KEY]: raw });
    const loaded = loadPersistedState(mockStorage);
    assert.deepEqual(loaded, DEFAULT_PERSISTED_STATE, `failed to reset invalid payload: ${raw}`);
    assert.deepEqual(
      JSON.parse(mockStorage.getItem(STORAGE_KEY)),
      DEFAULT_PERSISTED_STATE,
      `storage entry not reset for: ${raw}`
    );
  }
});

test("savePersistedState rejects invalid payloads without overwriting existing valid state or throwing", () => {
  const validInitial = {
    schemaVersion: 1,
    highScore: 5000,
    muted: false,
    crtScanlines: true,
  };
  const mockStorage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify(validInitial),
  });

  const badPayloads = [
    null,
    undefined,
    [],
    { schemaVersion: 2, highScore: 9000, muted: false, crtScanlines: false },
    { schemaVersion: 1, highScore: -1, muted: false, crtScanlines: false },
    { schemaVersion: 1, highScore: 99.9, muted: false, crtScanlines: false },
    { schemaVersion: 1, highScore: Number.NaN, muted: false, crtScanlines: false },
    { schemaVersion: 1, highScore: 100, muted: "false", crtScanlines: false },
    { schemaVersion: 1, highScore: 100, muted: false, crtScanlines: false, extra: 1 },
  ];

  for (const bad of badPayloads) {
    assert.equal(savePersistedState(bad, mockStorage), false);
  }

  assert.deepEqual(loadPersistedState(mockStorage), validInitial);
});

test("storage handles throwing getItem/setItem mocks gracefully without throwing", () => {
  const throwingStorage = {
    getItem() {
      throw new Error("SecurityError: storage blocked");
    },
    setItem() {
      throw new Error("QuotaExceededError: storage full");
    },
  };

  assert.deepEqual(loadPersistedState(throwingStorage), DEFAULT_PERSISTED_STATE);
  assert.equal(
    savePersistedState(
      { schemaVersion: 1, highScore: 100, muted: false, crtScanlines: false },
      throwingStorage
    ),
    false
  );
});
