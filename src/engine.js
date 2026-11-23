import {
  DEATH_CAUSES,
  DIRECTIONS,
  ENTITY_KINDS,
  FROG_CONFIG,
  GAME_PHASES,
  GRID_COLS,
  GRID_ROWS,
  HOME_BAY_CENTERS,
  HOME_BAY_TOLERANCE,
  LANE_SPECS,
  LANE_ZONES,
  PROGRESSION,
  ROWS,
  SCORING,
  TIMERS,
  TURTLE_DIVE_STATES,
  getLevelSpeedMultiplier,
} from "./config.js";

const VALID_DIRECTIONS = new Set(Object.values(DIRECTIONS));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeHighScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(SCORING.MAX_SCORE, Math.floor(value));
}

function wrapX(x, wrapWidth) {
  const mod = x % wrapWidth;
  if (mod < 0) {
    return mod + wrapWidth;
  }
  return mod === 0 ? 0 : mod;
}

function createInitialFrog() {
  return {
    x: FROG_CONFIG.SPAWN_X,
    row: FROG_CONFIG.SPAWN_ROW,
    startX: FROG_CONFIG.SPAWN_X,
    startRow: FROG_CONFIG.SPAWN_ROW,
    targetX: FROG_CONFIG.SPAWN_X,
    targetRow: FROG_CONFIG.SPAWN_ROW,
    facing: DIRECTIONS.UP,
    hopping: false,
    hopElapsedMs: 0,
    hopDurationMs: FROG_CONFIG.HOP_DURATION_MS,
    minRowReached: FROG_CONFIG.SPAWN_ROW,
  };
}

function createInitialLanes() {
  return LANE_SPECS.map((lane) => ({
    row: lane.row,
    zone: lane.zone,
    direction: lane.direction,
    baseSpeed: lane.baseSpeed,
    wrapWidth: lane.wrapWidth,
    entities: lane.entities.map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      x: entity.x,
      width: entity.width,
      dives: entity.dives,
      diveState: entity.diveState,
      diveTimerMs: entity.diveTimerMs,
    })),
  }));
}

function createInitialHomeBays() {
  return HOME_BAY_CENTERS.map((centerX, index) => ({
    index,
    centerX,
    occupied: false,
    hasFly: false,
    flyTimerMs: 0,
  }));
}

function cloneState(state) {
  return {
    phase: state.phase,
    score: state.score,
    highScore: state.highScore,
    lives: state.lives,
    level: state.level,
    extraLifeAwarded: state.extraLifeAwarded,
    timeRemainingMs: state.timeRemainingMs,
    timeLimitMs: state.timeLimitMs,
    phaseTimerMs: state.phaseTimerMs,
    deathCause: state.deathCause,
    flySpawnCooldownMs: state.flySpawnCooldownMs,
    frog: { ...state.frog },
    lanes: state.lanes.map((lane) => ({
      row: lane.row,
      zone: lane.zone,
      direction: lane.direction,
      baseSpeed: lane.baseSpeed,
      wrapWidth: lane.wrapWidth,
      entities: lane.entities.map((entity) => ({ ...entity })),
    })),
    homeBays: state.homeBays.map((bay) => ({ ...bay })),
  };
}

function addScore(state, points, events) {
  if (points <= 0) {
    return;
  }
  state.score = Math.min(SCORING.MAX_SCORE, state.score + points);
  if (state.score > state.highScore) {
    state.highScore = state.score;
  }
  if (!state.extraLifeAwarded && state.score >= SCORING.EXTRA_LIFE_THRESHOLD) {
    state.extraLifeAwarded = true;
    state.lives = Math.min(PROGRESSION.MAX_LIVES, state.lives + 1);
    events.push("extraLife");
  }
}

function advanceTurtleDive(entity, dtMs) {
  if (entity.kind !== ENTITY_KINDS.TURTLE_GROUP || !entity.dives) {
    return;
  }
  entity.diveTimerMs += dtMs;
  while (true) {
    if (entity.diveState === TURTLE_DIVE_STATES.SURFACE) {
      if (entity.diveTimerMs >= TIMERS.TURTLE_SURFACE_MS) {
        entity.diveTimerMs -= TIMERS.TURTLE_SURFACE_MS;
        entity.diveState = TURTLE_DIVE_STATES.SINK_WARN;
      } else {
        break;
      }
    } else if (entity.diveState === TURTLE_DIVE_STATES.SINK_WARN) {
      if (entity.diveTimerMs >= TIMERS.TURTLE_SINK_WARN_MS) {
        entity.diveTimerMs -= TIMERS.TURTLE_SINK_WARN_MS;
        entity.diveState = TURTLE_DIVE_STATES.SUBMERGED;
      } else {
        break;
      }
    } else if (entity.diveState === TURTLE_DIVE_STATES.SUBMERGED) {
      if (entity.diveTimerMs >= TIMERS.TURTLE_SUBMERGED_MS) {
        entity.diveTimerMs -= TIMERS.TURTLE_SUBMERGED_MS;
        entity.diveState = TURTLE_DIVE_STATES.SURFACE;
      } else {
        break;
      }
    } else {
      break;
    }
  }
}

function advanceLanes(lanes, level, dtMs) {
  const multiplier = getLevelSpeedMultiplier(level);
  const dtSec = dtMs / 1000;
  for (const lane of lanes) {
    const dx = lane.direction * lane.baseSpeed * multiplier * dtSec;
    for (const entity of lane.entities) {
      entity.x = wrapX(entity.x + dx, lane.wrapWidth);
      advanceTurtleDive(entity, dtMs);
    }
  }
}

function entityOverlapsHorizontal(entity, wrapWidth, left, right) {
  const eStart = entity.x;
  const eEnd = eStart + entity.width;
  if (left < eEnd && right > eStart) {
    return true;
  }
  const wrappedLeftStart = eStart - wrapWidth;
  const wrappedLeftEnd = eEnd - wrapWidth;
  if (left < wrappedLeftEnd && right > wrappedLeftStart) {
    return true;
  }
  const wrappedRightStart = eStart + wrapWidth;
  const wrappedRightEnd = eEnd + wrapWidth;
  return left < wrappedRightEnd && right > wrappedRightStart;
}

function isRideablePlatform(entity) {
  if (entity.kind === ENTITY_KINDS.LOG) {
    return true;
  }
  if (entity.kind === ENTITY_KINDS.TURTLE_GROUP) {
    return entity.diveState !== TURTLE_DIVE_STATES.SUBMERGED;
  }
  return false;
}

function findOverlappingPlatform(lane, frogX) {
  const left = frogX + FROG_CONFIG.RIVER_HITBOX_INSET;
  const right = frogX + FROG_CONFIG.WIDTH - FROG_CONFIG.RIVER_HITBOX_INSET;
  for (const entity of lane.entities) {
    if (isRideablePlatform(entity) && entityOverlapsHorizontal(entity, lane.wrapWidth, left, right)) {
      return entity;
    }
  }
  return null;
}

function hasRoadCollision(lane, frogX) {
  const left = frogX + FROG_CONFIG.ROAD_HITBOX_INSET;
  const right = frogX + FROG_CONFIG.WIDTH - FROG_CONFIG.ROAD_HITBOX_INSET;
  for (const entity of lane.entities) {
    if (entityOverlapsHorizontal(entity, lane.wrapWidth, left, right)) {
      return true;
    }
  }
  return false;
}

function triggerDeath(state, cause, soundEvent, events) {
  state.phase = GAME_PHASES.DYING;
  state.deathCause = cause;
  state.phaseTimerMs = TIMERS.DYING_DURATION_MS;
  state.frog.hopping = false;
  state.frog.hopElapsedMs = 0;
  events.push(soundEvent);
}

function findMatchingHomeBay(homeBays, frogX) {
  for (const bay of homeBays) {
    if (Math.abs(frogX - bay.centerX) <= HOME_BAY_TOLERANCE + 1e-9) {
      return bay;
    }
  }
  return null;
}

function expireActiveFlies(homeBays, dtMs) {
  let hadActiveFly = false;
  for (const bay of homeBays) {
    if (bay.hasFly) {
      hadActiveFly = true;
      bay.flyTimerMs = Math.max(0, bay.flyTimerMs - dtMs);
      if (bay.flyTimerMs === 0) {
        bay.hasFly = false;
      }
    }
  }
  return hadActiveFly;
}

function maybeSpawnBonusFly(state, dtMs, rng) {
  state.flySpawnCooldownMs = Math.max(0, state.flySpawnCooldownMs - dtMs);
  if (state.flySpawnCooldownMs > 0) {
    return;
  }
  const openBays = state.homeBays.filter((bay) => !bay.occupied && !bay.hasFly);
  if (openBays.length === 0) {
    return;
  }
  const raw = typeof rng === "function" ? rng() : 0;
  const safeRng = Number.isFinite(raw) ? clamp(raw, 0, 0.999999999999) : 0;
  const idx = Math.min(openBays.length - 1, Math.floor(safeRng * openBays.length));
  const chosenBay = openBays[idx];
  chosenBay.hasFly = true;
  chosenBay.flyTimerMs = TIMERS.FLY_ACTIVE_DURATION_MS;
  state.flySpawnCooldownMs = TIMERS.FLY_SPAWN_COOLDOWN_MS;
}

export function createInitialState(persistedHighScore = 0) {
  return {
    phase: GAME_PHASES.TITLE,
    score: 0,
    highScore: sanitizeHighScore(persistedHighScore),
    lives: PROGRESSION.STARTING_LIVES,
    level: PROGRESSION.STARTING_LEVEL,
    extraLifeAwarded: false,
    timeRemainingMs: TIMERS.FROG_TIME_LIMIT_MS,
    timeLimitMs: TIMERS.FROG_TIME_LIMIT_MS,
    phaseTimerMs: 0,
    deathCause: null,
    flySpawnCooldownMs: TIMERS.FLY_SPAWN_COOLDOWN_MS,
    frog: createInitialFrog(),
    lanes: createInitialLanes(),
    homeBays: createInitialHomeBays(),
  };
}

export function startNewGame(state) {
  const prevHigh = state ? sanitizeHighScore(Math.max(state.highScore ?? 0, state.score ?? 0)) : 0;
  const fresh = createInitialState(prevHigh);
  fresh.phase = GAME_PHASES.PLAYING;
  return fresh;
}

export function togglePause(state) {
  const next = cloneState(state);
  if (next.phase === GAME_PHASES.PLAYING) {
    next.phase = GAME_PHASES.PAUSED;
  } else if (next.phase === GAME_PHASES.PAUSED) {
    next.phase = GAME_PHASES.PLAYING;
  }
  return next;
}

export function queueHop(state, direction) {
  const next = cloneState(state);
  const events = [];

  if (next.phase !== GAME_PHASES.PLAYING || next.frog.hopping || !VALID_DIRECTIONS.has(direction)) {
    return { state: next, events };
  }

  let dx = 0;
  let dy = 0;
  if (direction === DIRECTIONS.LEFT) {
    dx = -1;
  } else if (direction === DIRECTIONS.RIGHT) {
    dx = 1;
  } else if (direction === DIRECTIONS.UP) {
    dy = -1;
  } else if (direction === DIRECTIONS.DOWN) {
    dy = 1;
  }

  const startX = clamp(next.frog.x, 0, GRID_COLS - 1);
  const startRow = clamp(Math.round(next.frog.row), 0, GRID_ROWS - 1);
  const targetX = clamp(next.frog.x + dx, 0, GRID_COLS - 1);
  const targetRow = clamp(startRow + dy, 0, GRID_ROWS - 1);

  next.frog.startX = startX;
  next.frog.startRow = startRow;
  next.frog.targetX = targetX;
  next.frog.targetRow = targetRow;
  next.frog.facing = direction;
  next.frog.hopping = true;
  next.frog.hopElapsedMs = 0;
  next.frog.hopDurationMs = FROG_CONFIG.HOP_DURATION_MS;

  if (targetRow < next.frog.minRowReached) {
    next.frog.minRowReached = targetRow;
    addScore(next, SCORING.FORWARD_HOP, events);
  }

  events.push("hop");
  return { state: next, events };
}

export function stepSimulation(state, dtMs, rng = Math.random) {
  const next = cloneState(state);
  const events = [];

  if (typeof dtMs !== "number" || !Number.isFinite(dtMs) || dtMs <= 0) {
    return { state: next, events };
  }

  if (
    next.phase === GAME_PHASES.TITLE ||
    next.phase === GAME_PHASES.PAUSED ||
    next.phase === GAME_PHASES.GAME_OVER
  ) {
    return { state: next, events };
  }

  if (next.phase === GAME_PHASES.DYING) {
    advanceLanes(next.lanes, next.level, dtMs);
    next.phaseTimerMs = Math.max(0, next.phaseTimerMs - dtMs);
    if (next.phaseTimerMs === 0) {
      next.lives = Math.max(0, next.lives - 1);
      next.deathCause = null;
      if (next.lives === 0) {
        next.phase = GAME_PHASES.GAME_OVER;
        if (next.score > next.highScore) {
          next.highScore = next.score;
        }
        events.push("gameOver");
      } else {
        next.phase = GAME_PHASES.PLAYING;
        next.frog = createInitialFrog();
        next.timeRemainingMs = next.timeLimitMs;
      }
    }
    return { state: next, events };
  }

  if (next.phase === GAME_PHASES.ROUND_CLEAR) {
    next.phaseTimerMs = Math.max(0, next.phaseTimerMs - dtMs);
    if (next.phaseTimerMs === 0) {
      next.level += 1;
      next.phase = GAME_PHASES.PLAYING;
      next.homeBays = createInitialHomeBays();
      next.frog = createInitialFrog();
      next.timeRemainingMs = next.timeLimitMs;
      next.flySpawnCooldownMs = TIMERS.FLY_SPAWN_COOLDOWN_MS;
    }
    return { state: next, events };
  }

  // PLAYING phase
  const hadActiveFly = expireActiveFlies(next.homeBays, dtMs);
  const prevTimeRemainingMs = next.timeRemainingMs;
  next.timeRemainingMs = Math.max(0, next.timeRemainingMs - dtMs);

  const wasHopping = next.frog.hopping;
  const startRow = Math.round(next.frog.row);
  let ridingRiverLane = null;

  if (!wasHopping && startRow >= ROWS.RIVER_MIN && startRow <= ROWS.RIVER_MAX) {
    const lane = next.lanes.find((l) => l.row === startRow);
    if (lane && findOverlappingPlatform(lane, next.frog.x)) {
      ridingRiverLane = lane;
    }
  }

  advanceLanes(next.lanes, next.level, dtMs);

  if (wasHopping) {
    next.frog.hopElapsedMs += dtMs;
    const t = Math.min(1, next.frog.hopElapsedMs / next.frog.hopDurationMs);
    next.frog.x = next.frog.startX + (next.frog.targetX - next.frog.startX) * t;
    next.frog.row = next.frog.startRow + (next.frog.targetRow - next.frog.startRow) * t;

    if (next.frog.hopElapsedMs >= next.frog.hopDurationMs) {
      next.frog.x = next.frog.targetX;
      next.frog.row = next.frog.targetRow;
      next.frog.startX = next.frog.targetX;
      next.frog.startRow = next.frog.targetRow;
      next.frog.hopping = false;
      next.frog.hopElapsedMs = 0;
    }
  } else if (ridingRiverLane) {
    const multiplier = getLevelSpeedMultiplier(next.level);
    const dx = ridingRiverLane.direction * ridingRiverLane.baseSpeed * multiplier * (dtMs / 1000);
    next.frog.x = clamp(next.frog.x + dx, -1, GRID_COLS);
  }

  const currentRow = Math.round(next.frog.row);

  if (currentRow === ROWS.GOAL_BANK) {
    if (!next.frog.hopping) {
      const bay = findMatchingHomeBay(next.homeBays, next.frog.x);
      if (!bay || bay.occupied) {
        triggerDeath(next, DEATH_CAUSES.BANK_COLLISION, "splat", events);
        return { state: next, events };
      }

      bay.occupied = true;
      const wholeSecondsRemaining = Math.max(0, Math.floor(next.timeRemainingMs / 1000));
      let points = SCORING.HOME_BAY + wholeSecondsRemaining * SCORING.TIME_BONUS_PER_SECOND;
      const caughtFly = bay.hasFly;
      if (caughtFly) {
        bay.hasFly = false;
        bay.flyTimerMs = 0;
        points += SCORING.BONUS_FLY;
      }

      events.push("home");
      if (caughtFly) {
        events.push("bonus");
      }
      addScore(next, points, events);

      if (next.homeBays.every((b) => b.occupied)) {
        addScore(next, SCORING.ROUND_CLEAR, events);
        next.phase = GAME_PHASES.ROUND_CLEAR;
        next.phaseTimerMs = TIMERS.ROUND_CLEAR_DURATION_MS;
        next.frog.x = bay.centerX;
        next.frog.row = ROWS.GOAL_BANK;
        events.push("roundClear");
      } else {
        next.frog = createInitialFrog();
        next.timeRemainingMs = next.timeLimitMs;
        if (!hadActiveFly) {
          maybeSpawnBonusFly(next, dtMs, rng);
        }
      }
      return { state: next, events };
    }
  } else if (currentRow >= ROWS.ROAD_MIN && currentRow <= ROWS.ROAD_MAX) {
    if (!next.frog.hopping || next.frog.startRow === next.frog.targetRow) {
      const roadLane = next.lanes.find((l) => l.row === currentRow && l.zone === LANE_ZONES.ROAD);
      if (roadLane && hasRoadCollision(roadLane, next.frog.x)) {
        triggerDeath(next, DEATH_CAUSES.ROADKILL, "splat", events);
        return { state: next, events };
      }
    }
  } else if (currentRow >= ROWS.RIVER_MIN && currentRow <= ROWS.RIVER_MAX) {
    if (!next.frog.hopping) {
      if (
        next.frog.x < FROG_CONFIG.OUT_OF_BOUNDS_MIN_X ||
        next.frog.x > FROG_CONFIG.OUT_OF_BOUNDS_MAX_X
      ) {
        triggerDeath(next, DEATH_CAUSES.OUT_OF_BOUNDS, "splash", events);
        return { state: next, events };
      }
      const riverLane = next.lanes.find((l) => l.row === currentRow && l.zone === LANE_ZONES.RIVER);
      if (!riverLane || !findOverlappingPlatform(riverLane, next.frog.x)) {
        triggerDeath(next, DEATH_CAUSES.DROWNED, "splash", events);
        return { state: next, events };
      }
    }
  }

  if (next.timeRemainingMs === 0) {
    triggerDeath(next, DEATH_CAUSES.TIMEOUT, "splat", events);
    return { state: next, events };
  }

  if (prevTimeRemainingMs > TIMERS.LOW_TIME_WARN_MS && next.timeRemainingMs <= TIMERS.LOW_TIME_WARN_MS) {
    events.push("timeWarn");
  }

  if (!hadActiveFly) {
    maybeSpawnBonusFly(next, dtMs, rng);
  }

  return { state: next, events };
}
