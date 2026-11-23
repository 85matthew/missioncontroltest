function deepFreeze(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return Object.freeze(value);
}

export const GRID_COLS = 14;
export const GRID_ROWS = 13;
export const TILE_SIZE = 48;

export const HUD_TOP_HEIGHT = 56;
export const HUD_BOTTOM_HEIGHT = 48;
export const PLAYFIELD_WIDTH = GRID_COLS * TILE_SIZE;
export const PLAYFIELD_HEIGHT = GRID_ROWS * TILE_SIZE;
export const CANVAS_WIDTH = PLAYFIELD_WIDTH;
export const CANVAS_HEIGHT = HUD_TOP_HEIGHT + PLAYFIELD_HEIGHT + HUD_BOTTOM_HEIGHT;

export const ROWS = deepFreeze({
  GOAL_BANK: 0,
  RIVER_MIN: 1,
  RIVER_MAX: 5,
  MEDIAN: 6,
  ROAD_MIN: 7,
  ROAD_MAX: 11,
  START: 12,
});

export const GAME_PHASES = deepFreeze({
  TITLE: "TITLE",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  DYING: "DYING",
  ROUND_CLEAR: "ROUND_CLEAR",
  GAME_OVER: "GAME_OVER",
});

export const DIRECTIONS = deepFreeze({
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
});

export const DEATH_CAUSES = deepFreeze({
  ROADKILL: "ROADKILL",
  DROWNED: "DROWNED",
  BANK_COLLISION: "BANK_COLLISION",
  TIMEOUT: "TIMEOUT",
  OUT_OF_BOUNDS: "OUT_OF_BOUNDS",
});

export const TURTLE_DIVE_STATES = deepFreeze({
  SURFACE: "SURFACE",
  SINK_WARN: "SINK_WARN",
  SUBMERGED: "SUBMERGED",
});

export const ENTITY_KINDS = deepFreeze({
  TRUCK: "TRUCK",
  RACE_CAR: "RACE_CAR",
  SEDAN: "SEDAN",
  BULLDOZER: "BULLDOZER",
  BUGGY: "BUGGY",
  LOG: "LOG",
  TURTLE_GROUP: "TURTLE_GROUP",
});

export const LANE_ZONES = deepFreeze({
  RIVER: "RIVER",
  ROAD: "ROAD",
});

export const HOME_BAY_CENTERS = deepFreeze([1.0, 4.0, 7.0, 10.0, 13.0]);
export const HOME_BAY_TOLERANCE = 0.65;

export const FROG_CONFIG = deepFreeze({
  SPAWN_X: 7,
  SPAWN_ROW: 12,
  HOP_DURATION_MS: 90,
  WIDTH: 1,
  RIVER_HITBOX_INSET: 0.15,
  ROAD_HITBOX_INSET: 0.15,
  OUT_OF_BOUNDS_MIN_X: -0.25,
  OUT_OF_BOUNDS_MAX_X: 13.25,
});

export const SCORING = deepFreeze({
  FORWARD_HOP: 10,
  HOME_BAY: 50,
  TIME_BONUS_PER_SECOND: 10,
  BONUS_FLY: 200,
  ROUND_CLEAR: 1000,
  EXTRA_LIFE_THRESHOLD: 20000,
  MAX_SCORE: 9999999,
});

export const TIMERS = deepFreeze({
  FROG_TIME_LIMIT_MS: 30000,
  LOW_TIME_WARN_MS: 5000,
  DYING_DURATION_MS: 1000,
  ROUND_CLEAR_DURATION_MS: 1500,
  FLY_SPAWN_COOLDOWN_MS: 8000,
  FLY_ACTIVE_DURATION_MS: 6000,
  TURTLE_SURFACE_MS: 3500,
  TURTLE_SINK_WARN_MS: 1200,
  TURTLE_SUBMERGED_MS: 1400,
});

export const PROGRESSION = deepFreeze({
  STARTING_LIVES: 3,
  MAX_LIVES: 9,
  STARTING_LEVEL: 1,
  SPEED_STEP_PER_LEVEL: 0.12,
  MAX_SPEED_MULTIPLIER: 2.2,
});

export const MIN_ENTITY_GAP = 0.8;

function makeEntity(id, kind, x, width, dives = false, diveTimerMs = 0) {
  return {
    id,
    kind,
    x,
    width,
    dives,
    diveState: TURTLE_DIVE_STATES.SURFACE,
    diveTimerMs,
  };
}

export const LANE_SPECS = deepFreeze([
  {
    row: 1,
    zone: LANE_ZONES.RIVER,
    direction: 1,
    baseSpeed: 2.1,
    wrapWidth: 21,
    entities: [
      makeEntity("r1-log-0", ENTITY_KINDS.LOG, 0.5, 3.5),
      makeEntity("r1-log-1", ENTITY_KINDS.LOG, 7.5, 3.5),
      makeEntity("r1-log-2", ENTITY_KINDS.LOG, 14.5, 3.5),
    ],
  },
  {
    row: 2,
    zone: LANE_ZONES.RIVER,
    direction: -1,
    baseSpeed: 1.9,
    wrapWidth: 20,
    entities: [
      makeEntity("r2-turtle-0", ENTITY_KINDS.TURTLE_GROUP, 1.0, 2.0, true, 0),
      makeEntity("r2-turtle-1", ENTITY_KINDS.TURTLE_GROUP, 6.0, 2.0, false, 0),
      makeEntity("r2-turtle-2", ENTITY_KINDS.TURTLE_GROUP, 11.0, 2.0, true, 1800),
      makeEntity("r2-turtle-3", ENTITY_KINDS.TURTLE_GROUP, 16.0, 2.0, false, 0),
    ],
  },
  {
    row: 3,
    zone: LANE_ZONES.RIVER,
    direction: 1,
    baseSpeed: 2.7,
    wrapWidth: 22,
    entities: [
      makeEntity("r3-log-0", ENTITY_KINDS.LOG, 0.0, 4.5),
      makeEntity("r3-log-1", ENTITY_KINDS.LOG, 7.5, 4.5),
      makeEntity("r3-log-2", ENTITY_KINDS.LOG, 15.0, 4.5),
    ],
  },
  {
    row: 4,
    zone: LANE_ZONES.RIVER,
    direction: 1,
    baseSpeed: 1.6,
    wrapWidth: 19,
    entities: [
      makeEntity("r4-log-0", ENTITY_KINDS.LOG, 0.5, 2.5),
      makeEntity("r4-log-1", ENTITY_KINDS.LOG, 5.5, 2.5),
      makeEntity("r4-log-2", ENTITY_KINDS.LOG, 10.5, 2.5),
      makeEntity("r4-log-3", ENTITY_KINDS.LOG, 15.5, 2.5),
    ],
  },
  {
    row: 5,
    zone: LANE_ZONES.RIVER,
    direction: -1,
    baseSpeed: 2.2,
    wrapWidth: 20,
    entities: [
      makeEntity("r5-turtle-0", ENTITY_KINDS.TURTLE_GROUP, 0.5, 3.0, false, 0),
      makeEntity("r5-turtle-1", ENTITY_KINDS.TURTLE_GROUP, 5.5, 3.0, true, 0),
      makeEntity("r5-turtle-2", ENTITY_KINDS.TURTLE_GROUP, 10.5, 3.0, false, 0),
      makeEntity("r5-turtle-3", ENTITY_KINDS.TURTLE_GROUP, 15.5, 3.0, true, 1200),
    ],
  },
  {
    row: 7,
    zone: LANE_ZONES.ROAD,
    direction: -1,
    baseSpeed: 1.8,
    wrapWidth: 20,
    entities: [
      makeEntity("r7-truck-0", ENTITY_KINDS.TRUCK, 1.0, 2.4),
      makeEntity("r7-truck-1", ENTITY_KINDS.TRUCK, 7.5, 2.4),
      makeEntity("r7-truck-2", ENTITY_KINDS.TRUCK, 14.0, 2.4),
    ],
  },
  {
    row: 8,
    zone: LANE_ZONES.ROAD,
    direction: 1,
    baseSpeed: 3.6,
    wrapWidth: 18,
    entities: [
      makeEntity("r8-racecar-0", ENTITY_KINDS.RACE_CAR, 2.0, 1.2),
      makeEntity("r8-racecar-1", ENTITY_KINDS.RACE_CAR, 11.0, 1.2),
    ],
  },
  {
    row: 9,
    zone: LANE_ZONES.ROAD,
    direction: -1,
    baseSpeed: 2.3,
    wrapWidth: 18,
    entities: [
      makeEntity("r9-sedan-0", ENTITY_KINDS.SEDAN, 0.5, 1.4),
      makeEntity("r9-sedan-1", ENTITY_KINDS.SEDAN, 6.5, 1.4),
      makeEntity("r9-sedan-2", ENTITY_KINDS.SEDAN, 12.5, 1.4),
    ],
  },
  {
    row: 10,
    zone: LANE_ZONES.ROAD,
    direction: 1,
    baseSpeed: 1.4,
    wrapWidth: 18,
    entities: [
      makeEntity("r10-bulldozer-0", ENTITY_KINDS.BULLDOZER, 1.0, 1.8),
      makeEntity("r10-bulldozer-1", ENTITY_KINDS.BULLDOZER, 7.0, 1.8),
      makeEntity("r10-bulldozer-2", ENTITY_KINDS.BULLDOZER, 13.0, 1.8),
    ],
  },
  {
    row: 11,
    zone: LANE_ZONES.ROAD,
    direction: -1,
    baseSpeed: 2.5,
    wrapWidth: 19,
    entities: [
      makeEntity("r11-buggy-0", ENTITY_KINDS.BUGGY, 2.0, 1.3),
      makeEntity("r11-buggy-1", ENTITY_KINDS.BUGGY, 8.0, 1.3),
      makeEntity("r11-buggy-2", ENTITY_KINDS.BUGGY, 14.0, 1.3),
    ],
  },
]);

export function getLevelSpeedMultiplier(level) {
  const safeLevel = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return Math.min(
    PROGRESSION.MAX_SPEED_MULTIPLIER,
    1 + (safeLevel - 1) * PROGRESSION.SPEED_STEP_PER_LEVEL
  );
}
