import test from "node:test";
import assert from "node:assert/strict";

import {
  DEATH_CAUSES,
  DIRECTIONS,
  FROG_CONFIG,
  GAME_PHASES,
  HOME_BAY_CENTERS,
  HOME_BAY_TOLERANCE,
  PROGRESSION,
  ROWS,
  SCORING,
  TIMERS,
  getLevelSpeedMultiplier,
} from "../src/config.js";

import {
  createInitialState,
  queueHop,
  startNewGame,
  stepSimulation,
} from "../src/engine.js";

function clearLanes(state) {
  for (const lane of state.lanes) {
    lane.entities = [];
  }
}

function positionFrogOnRow1(state, x) {
  state.frog.x = x;
  state.frog.startX = x;
  state.frog.targetX = x;
  state.frog.row = ROWS.RIVER_MIN;
  state.frog.startRow = ROWS.RIVER_MIN;
  state.frog.targetRow = ROWS.RIVER_MIN;
  state.frog.minRowReached = ROWS.RIVER_MIN;
  state.frog.hopping = false;
  state.frog.hopElapsedMs = 0;
}

test("home bay landing succeeds within tolerance, awards base + time bonus, and resets frog for next bay", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);

  // Place frog on row 1 aligned with bay 1 (centerX = 4.0) + exact tolerance edge (+0.65)
  positionFrogOnRow1(s, HOME_BAY_CENTERS[1] + HOME_BAY_TOLERANCE);
  s.timeRemainingMs = 20090; // After 90ms hop -> 20000ms -> 20 whole seconds remaining

  const hopped = queueHop(s, DIRECTIONS.UP);
  assert.equal(hopped.state.score, SCORING.FORWARD_HOP); // +10 for reaching row 0
  assert.deepEqual(hopped.events, ["hop"]);

  const landed = stepSimulation(hopped.state, FROG_CONFIG.HOP_DURATION_MS);
  assert.equal(landed.state.phase, GAME_PHASES.PLAYING);
  assert.equal(landed.state.homeBays[1].occupied, true);
  assert.ok(landed.events.includes("home"));
  assert.equal(landed.events.includes("bonus"), false);

  const expectedScore =
    SCORING.FORWARD_HOP + SCORING.HOME_BAY + 20 * SCORING.TIME_BONUS_PER_SECOND;
  assert.equal(landed.state.score, expectedScore);
  assert.equal(landed.state.highScore, expectedScore);

  // Frog resets to start curb with fresh timer and minRowReached = 12
  assert.equal(landed.state.frog.x, FROG_CONFIG.SPAWN_X);
  assert.equal(landed.state.frog.row, FROG_CONFIG.SPAWN_ROW);
  assert.equal(landed.state.frog.minRowReached, FROG_CONFIG.SPAWN_ROW);
  assert.equal(landed.state.timeRemainingMs, TIMERS.FROG_TIME_LIMIT_MS);
});

test("landing on riverbank foliage or an already-occupied bay triggers BANK_COLLISION death", () => {
  // Foliage miss: x = 2.5 (between bay 0 at 1.0 and bay 1 at 4.0)
  const missState = startNewGame(createInitialState(0));
  clearLanes(missState);
  positionFrogOnRow1(missState, 2.5);

  const missHop = queueHop(missState, DIRECTIONS.UP).state;
  const missResult = stepSimulation(missHop, FROG_CONFIG.HOP_DURATION_MS);
  assert.equal(missResult.state.phase, GAME_PHASES.DYING);
  assert.equal(missResult.state.deathCause, DEATH_CAUSES.BANK_COLLISION);
  assert.ok(missResult.events.includes("splat"));

  // Occupied bay collision: bay 2 (x = 7.0) already occupied
  const dupState = startNewGame(createInitialState(0));
  clearLanes(dupState);
  dupState.homeBays[2].occupied = true;
  positionFrogOnRow1(dupState, HOME_BAY_CENTERS[2]);

  const dupHop = queueHop(dupState, DIRECTIONS.UP).state;
  const dupResult = stepSimulation(dupHop, FROG_CONFIG.HOP_DURATION_MS);
  assert.equal(dupResult.state.phase, GAME_PHASES.DYING);
  assert.equal(dupResult.state.deathCause, DEATH_CAUSES.BANK_COLLISION);
  assert.ok(dupResult.events.includes("splat"));
});

test("deterministic bonus fly spawns via rng, expires after 6s, and awards +200 on pickup", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);
  s.homeBays[0].occupied = true;
  s.homeBays[2].occupied = true;
  // Remaining unoccupied bays are indices [1, 3, 4]

  // Advance 7999ms: fly has not spawned yet
  const beforeSpawn = stepSimulation(s, TIMERS.FLY_SPAWN_COOLDOWN_MS - 1, () => 0.5).state;
  assert.equal(beforeSpawn.homeBays.some((b) => b.hasFly), false);

  // Advance 1ms more with rng = 0.5 -> Math.floor(0.5 * 3) = 1 -> openBays[1] = bay index 3
  const spawned = stepSimulation(beforeSpawn, 1, () => 0.5).state;
  assert.equal(spawned.homeBays[3].hasFly, true);
  assert.equal(spawned.homeBays[3].flyTimerMs, TIMERS.FLY_ACTIVE_DURATION_MS);
  assert.equal(spawned.flySpawnCooldownMs, TIMERS.FLY_SPAWN_COOLDOWN_MS);

  // Expire after 6000ms if not collected
  const afterHalf = stepSimulation(spawned, 3000, () => 0).state;
  assert.equal(afterHalf.homeBays[3].hasFly, true);
  assert.equal(afterHalf.homeBays[3].flyTimerMs, 3000);

  const expired = stepSimulation(afterHalf, 3000, () => 0).state;
  assert.equal(expired.homeBays[3].hasFly, false);
  assert.equal(expired.homeBays[3].flyTimerMs, 0);

  // Catch active fly on bay 3
  const catchState = startNewGame(createInitialState(0));
  clearLanes(catchState);
  catchState.homeBays[3].hasFly = true;
  catchState.homeBays[3].flyTimerMs = TIMERS.FLY_ACTIVE_DURATION_MS;
  positionFrogOnRow1(catchState, HOME_BAY_CENTERS[3]);
  catchState.timeRemainingMs = 15090; // 15s remaining after 90ms hop

  const hopToFly = queueHop(catchState, DIRECTIONS.UP).state;
  const caught = stepSimulation(hopToFly, FROG_CONFIG.HOP_DURATION_MS);
  assert.equal(caught.state.homeBays[3].occupied, true);
  assert.equal(caught.state.homeBays[3].hasFly, false);
  assert.equal(caught.state.homeBays[3].flyTimerMs, 0);
  assert.ok(caught.events.includes("home"));
  assert.ok(caught.events.includes("bonus"));

  const expectedPoints =
    SCORING.FORWARD_HOP +
    SCORING.HOME_BAY +
    15 * SCORING.TIME_BONUS_PER_SECOND +
    SCORING.BONUS_FLY;
  assert.equal(caught.state.score, expectedPoints);
});

test("30s countdown timer emits timeWarn once at <=5s and triggers TIMEOUT death at 0", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);

  // Advance 24999ms -> 5001ms left -> no timeWarn yet
  const justAboveWarn = stepSimulation(s, 24999);
  assert.equal(justAboveWarn.state.timeRemainingMs, 5001);
  assert.equal(justAboveWarn.events.includes("timeWarn"), false);

  // Advance 100ms -> 4901ms left -> emits timeWarn once
  const crossedWarn = stepSimulation(justAboveWarn.state, 100);
  assert.equal(crossedWarn.state.timeRemainingMs, 4901);
  assert.ok(crossedWarn.events.includes("timeWarn"));

  // Subsequent ticks below 5000ms do not spam timeWarn
  const afterWarn = stepSimulation(crossedWarn.state, 1000);
  assert.equal(afterWarn.state.timeRemainingMs, 3901);
  assert.equal(afterWarn.events.includes("timeWarn"), false);

  // Advance remaining 3901ms -> TIMEOUT death
  const timedOut = stepSimulation(afterWarn.state, 3901);
  assert.equal(timedOut.state.timeRemainingMs, 0);
  assert.equal(timedOut.state.phase, GAME_PHASES.DYING);
  assert.equal(timedOut.state.deathCause, DEATH_CAUSES.TIMEOUT);
  assert.ok(timedOut.events.includes("splat"));
});

test("forward-progress scoring is non-farmable within an attempt and resets after death or home bay", () => {
  let s = startNewGame(createInitialState(0));
  clearLanes(s);

  // Hop UP twice to row 10 -> +20
  s = stepSimulation(queueHop(s, DIRECTIONS.UP).state, 90).state;
  s = stepSimulation(queueHop(s, DIRECTIONS.UP).state, 90).state;
  assert.equal(s.frog.row, 10);
  assert.equal(s.frog.minRowReached, 10);
  assert.equal(s.score, 20);

  // Hop DOWN to row 11 and UP to row 10 -> still 20
  s = stepSimulation(queueHop(s, DIRECTIONS.DOWN).state, 90).state;
  s = stepSimulation(queueHop(s, DIRECTIONS.UP).state, 90).state;
  assert.equal(s.score, 20);

  // Die via timeout -> respawn resets minRowReached to 12 so forward hops score again
  s.timeRemainingMs = 10;
  s = stepSimulation(s, 10).state;
  assert.equal(s.phase, GAME_PHASES.DYING);
  s = stepSimulation(s, TIMERS.DYING_DURATION_MS).state;
  assert.equal(s.phase, GAME_PHASES.PLAYING);
  assert.equal(s.frog.minRowReached, 12);

  s = stepSimulation(queueHop(s, DIRECTIONS.UP).state, 90).state;
  assert.equal(s.score, 30);
});

test("extra life is awarded strictly once at 20,000 points and lives decrement to GAME_OVER", () => {
  const s = startNewGame(createInitialState(1000));
  clearLanes(s);
  s.score = 19950;
  s.highScore = 19950;
  s.lives = 3;

  // Reach a home bay with 0s bonus (+10 forward + 50 home = +60 -> 20,010)
  positionFrogOnRow1(s, HOME_BAY_CENTERS[0]);
  s.timeRemainingMs = 500;

  const hop1 = queueHop(s, DIRECTIONS.UP);
  assert.equal(hop1.state.score, 19960);
  assert.equal(hop1.state.extraLifeAwarded, false);

  const crossed = stepSimulation(hop1.state, FROG_CONFIG.HOP_DURATION_MS);
  assert.equal(crossed.state.score, 20010);
  assert.equal(crossed.state.highScore, 20010);
  assert.equal(crossed.state.extraLifeAwarded, true);
  assert.equal(crossed.state.lives, 4);
  assert.ok(crossed.events.includes("extraLife"));

  // Further scoring does NOT award another extra life
  const secondBayState = crossed.state;
  positionFrogOnRow1(secondBayState, HOME_BAY_CENTERS[1]);
  secondBayState.timeRemainingMs = 20090;
  const secondResult = stepSimulation(
    queueHop(secondBayState, DIRECTIONS.UP).state,
    FROG_CONFIG.HOP_DURATION_MS
  );
  assert.equal(secondResult.state.lives, 4);
  assert.equal(secondResult.events.includes("extraLife"), false);

  // Decrement lives down to 0 -> GAME_OVER
  let losing = secondResult.state;
  losing.lives = 1;
  losing.timeRemainingMs = 50;
  losing = stepSimulation(losing, 50).state; // DYING
  assert.equal(losing.phase, GAME_PHASES.DYING);

  const gameOver = stepSimulation(losing, TIMERS.DYING_DURATION_MS);
  assert.equal(gameOver.state.lives, 0);
  assert.equal(gameOver.state.phase, GAME_PHASES.GAME_OVER);
  assert.ok(gameOver.events.includes("gameOver"));
  assert.equal(gameOver.state.highScore, losing.score);

  // Step during GAME_OVER is a no-op; startNewGame preserves highScore
  const frozen = stepSimulation(gameOver.state, 5000);
  assert.equal(frozen.state.phase, GAME_PHASES.GAME_OVER);
  assert.equal(frozen.events.length, 0);

  const restarted = startNewGame(gameOver.state);
  assert.equal(restarted.phase, GAME_PHASES.PLAYING);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.lives, PROGRESSION.STARTING_LIVES);
  assert.equal(restarted.highScore, gameOver.state.highScore);
  assert.equal(restarted.extraLifeAwarded, false);
});

test("filling all 5 bays triggers ROUND_CLEAR (+1000) and advances to level + 1 with scaled lane speeds", () => {
  const s = startNewGame(createInitialState(0));
  // Keep lane 0 entity at x = 0 to verify speed scaling on level 2
  for (let i = 1; i < s.lanes.length; i += 1) {
    s.lanes[i].entities = [];
  }
  s.lanes[0].entities = [
    {
      ...s.lanes[0].entities[0],
      x: 0,
    },
  ];

  // Occupy first 4 bays
  for (let i = 0; i < 4; i += 1) {
    s.homeBays[i].occupied = true;
  }

  // Land in 5th bay (index 4, x = 13.0)
  positionFrogOnRow1(s, HOME_BAY_CENTERS[4]);
  s.timeRemainingMs = 10090; // 10s remaining after 90ms hop

  const hop = queueHop(s, DIRECTIONS.UP).state;
  const cleared = stepSimulation(hop, FROG_CONFIG.HOP_DURATION_MS);

  assert.equal(cleared.state.phase, GAME_PHASES.ROUND_CLEAR);
  assert.equal(cleared.state.phaseTimerMs, TIMERS.ROUND_CLEAR_DURATION_MS);
  assert.ok(cleared.events.includes("home"));
  assert.ok(cleared.events.includes("roundClear"));

  const expectedRoundScore =
    SCORING.FORWARD_HOP +
    SCORING.HOME_BAY +
    10 * SCORING.TIME_BONUS_PER_SECOND +
    SCORING.ROUND_CLEAR;
  assert.equal(cleared.state.score, expectedRoundScore);

  // Mid ROUND_CLEAR stays in ROUND_CLEAR
  const midClear = stepSimulation(cleared.state, 500).state;
  assert.equal(midClear.phase, GAME_PHASES.ROUND_CLEAR);
  assert.equal(midClear.level, 1);

  // Complete ROUND_CLEAR -> level 2, bays cleared, frog reset, timer reset
  const level2 = stepSimulation(midClear, TIMERS.ROUND_CLEAR_DURATION_MS - 500).state;
  assert.equal(level2.phase, GAME_PHASES.PLAYING);
  assert.equal(level2.level, 2);
  assert.equal(level2.homeBays.every((b) => !b.occupied && !b.hasFly), true);
  assert.equal(level2.frog.x, FROG_CONFIG.SPAWN_X);
  assert.equal(level2.frog.row, FROG_CONFIG.SPAWN_ROW);
  assert.equal(level2.timeRemainingMs, TIMERS.FROG_TIME_LIMIT_MS);
  assert.equal(level2.flySpawnCooldownMs, TIMERS.FLY_SPAWN_COOLDOWN_MS);

  // Verify level 2 lane speed scaling (baseSpeed 2.1 * 1.12)
  const prevX = level2.lanes[0].entities[0].x;
  const after1sL2 = stepSimulation(level2, 1000).state;
  const expectedDx = level2.lanes[0].baseSpeed * getLevelSpeedMultiplier(2);
  const actualDx =
    (after1sL2.lanes[0].entities[0].x - prevX + level2.lanes[0].wrapWidth) %
    level2.lanes[0].wrapWidth;
  assert.ok(Math.abs(actualDx - expectedDx) < 1e-9);
});
