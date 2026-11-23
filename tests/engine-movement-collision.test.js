import test from "node:test";
import assert from "node:assert/strict";

import {
  DEATH_CAUSES,
  DIRECTIONS,
  ENTITY_KINDS,
  FROG_CONFIG,
  GAME_PHASES,
  GRID_COLS,
  GRID_ROWS,
  LANE_SPECS,
  PROGRESSION,
  ROWS,
  SCORING,
  TIMERS,
  TURTLE_DIVE_STATES,
  getLevelSpeedMultiplier,
} from "../src/config.js";

import {
  createInitialState,
  queueHop,
  startNewGame,
  stepSimulation,
  togglePause,
} from "../src/engine.js";

function clearLanes(state) {
  for (const lane of state.lanes) {
    lane.entities = [];
  }
}

test("createInitialState sanitizes persistedHighScore and builds valid TITLE state", () => {
  const s1 = createInitialState(12500.8);
  assert.equal(s1.phase, GAME_PHASES.TITLE);
  assert.equal(s1.highScore, 12500);
  assert.equal(s1.score, 0);
  assert.equal(s1.lives, PROGRESSION.STARTING_LIVES);
  assert.equal(s1.level, PROGRESSION.STARTING_LEVEL);
  assert.equal(s1.deathCause, null);
  assert.equal(s1.lanes.length, 10);
  assert.equal(s1.homeBays.length, 5);
  assert.equal(s1.frog.x, FROG_CONFIG.SPAWN_X);
  assert.equal(s1.frog.row, FROG_CONFIG.SPAWN_ROW);
  assert.equal(s1.frog.hopping, false);

  assert.equal(createInitialState(-50).highScore, 0);
  assert.equal(createInitialState(Number.NaN).highScore, 0);
  assert.equal(createInitialState("999").highScore, 0);
  assert.equal(createInitialState(99999999).highScore, SCORING.MAX_SCORE);

  // Mutating returned lanes does not affect frozen LANE_SPECS
  s1.lanes[0].entities[0].x = 99;
  assert.notEqual(LANE_SPECS[0].entities[0].x, 99);
});

test("startNewGame, togglePause, and frozen phases behave deterministically without mutating input", () => {
  const title = createInitialState(4200);
  const frozenStep = stepSimulation(title, 500);
  assert.equal(frozenStep.events.length, 0);
  assert.equal(frozenStep.state.lanes[0].entities[0].x, title.lanes[0].entities[0].x);

  const started = startNewGame(title);
  assert.equal(title.phase, GAME_PHASES.TITLE);
  assert.equal(started.phase, GAME_PHASES.PLAYING);
  assert.equal(started.highScore, 4200);
  assert.equal(started.score, 0);
  assert.equal(started.lives, 3);
  assert.equal(started.timeRemainingMs, TIMERS.FROG_TIME_LIMIT_MS);

  const paused = togglePause(started);
  assert.equal(paused.phase, GAME_PHASES.PAUSED);
  assert.equal(started.phase, GAME_PHASES.PLAYING);

  const duringPauseHop = queueHop(paused, DIRECTIONS.UP);
  assert.equal(duringPauseHop.events.length, 0);
  assert.equal(duringPauseHop.state.frog.hopping, false);

  const duringPauseStep = stepSimulation(paused, 250);
  assert.equal(duringPauseStep.state.lanes[0].entities[0].x, paused.lanes[0].entities[0].x);

  const resumed = togglePause(paused);
  assert.equal(resumed.phase, GAME_PHASES.PLAYING);

  assert.equal(togglePause(title).phase, GAME_PHASES.TITLE);
});

test("discrete 1-tile hopping interpolates smoothly over 90ms and blocks overlapping hops", () => {
  const initial = startNewGame(createInitialState(0));
  clearLanes(initial);

  const { state: hoppingState, events } = queueHop(initial, DIRECTIONS.UP);
  assert.deepEqual(events, ["hop"]);
  assert.equal(initial.frog.hopping, false);
  assert.equal(hoppingState.frog.hopping, true);
  assert.equal(hoppingState.frog.facing, DIRECTIONS.UP);
  assert.equal(hoppingState.frog.startRow, 12);
  assert.equal(hoppingState.frog.targetRow, 11);
  assert.equal(hoppingState.frog.minRowReached, 11);
  assert.equal(hoppingState.score, SCORING.FORWARD_HOP);

  // Second hop while already hopping is ignored
  const blockedHop = queueHop(hoppingState, DIRECTIONS.LEFT);
  assert.deepEqual(blockedHop.events, []);
  assert.equal(blockedHop.state.frog.targetRow, 11);
  assert.equal(blockedHop.state.frog.targetX, 7);

  // Mid-hop interpolation at 45ms (50%)
  const half = stepSimulation(hoppingState, 45).state;
  assert.equal(half.frog.hopping, true);
  assert.ok(Math.abs(half.frog.row - 11.5) < 1e-9);
  assert.equal(half.frog.x, 7);

  // Complete hop at 90ms
  const landed = stepSimulation(half, 45).state;
  assert.equal(landed.frog.hopping, false);
  assert.equal(landed.frog.row, 11);
  assert.equal(landed.frog.x, 7);
  assert.equal(landed.frog.hopElapsedMs, 0);

  // Hopping down and back up to row 11 does not re-award forward hop points
  const down = stepSimulation(queueHop(landed, DIRECTIONS.DOWN).state, 90).state;
  assert.equal(down.frog.row, 12);
  assert.equal(down.score, SCORING.FORWARD_HOP);
  const upAgain = stepSimulation(queueHop(down, DIRECTIONS.UP).state, 90).state;
  assert.equal(upAgain.frog.row, 11);
  assert.equal(upAgain.score, SCORING.FORWARD_HOP);
});

test("boundary clamping prevents hopping outside [0..13] and [0..12]", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);

  // Left boundary
  s.frog.x = 0;
  s.frog.startX = 0;
  s.frog.targetX = 0;
  const leftClamped = stepSimulation(queueHop(s, DIRECTIONS.LEFT).state, 90).state;
  assert.equal(leftClamped.frog.x, 0);
  assert.equal(leftClamped.frog.facing, DIRECTIONS.LEFT);

  // Right boundary
  s.frog.x = GRID_COLS - 1;
  s.frog.startX = GRID_COLS - 1;
  s.frog.targetX = GRID_COLS - 1;
  const rightClamped = stepSimulation(queueHop(s, DIRECTIONS.RIGHT).state, 90).state;
  assert.equal(rightClamped.frog.x, GRID_COLS - 1);
  assert.equal(rightClamped.frog.facing, DIRECTIONS.RIGHT);

  // Bottom boundary
  s.frog.x = 7;
  s.frog.row = GRID_ROWS - 1;
  const downClamped = stepSimulation(queueHop(s, DIRECTIONS.DOWN).state, 90).state;
  assert.equal(downClamped.frog.row, GRID_ROWS - 1);
  assert.equal(downClamped.frog.facing, DIRECTIONS.DOWN);
});

test("lane entities wrap seamlessly in both directions and scale speed with level", () => {
  const s1 = startNewGame(createInitialState(0));
  const row1 = s1.lanes.find((l) => l.row === 1); // direction +1, baseSpeed 2.1, wrapWidth 21
  const row7 = s1.lanes.find((l) => l.row === 7); // direction -1, baseSpeed 1.8, wrapWidth 20

  row1.entities = [
    {
      id: "test-log",
      kind: ENTITY_KINDS.LOG,
      x: 20.0,
      width: 3.5,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];
  row7.entities = [
    {
      id: "test-truck",
      kind: ENTITY_KINDS.TRUCK,
      x: 0.5,
      width: 2.4,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];

  const after1s = stepSimulation(s1, 1000).state;
  const r1After = after1s.lanes.find((l) => l.row === 1).entities[0];
  const r7After = after1s.lanes.find((l) => l.row === 7).entities[0];

  // (20.0 + 2.1) % 21 = 1.1
  assert.ok(Math.abs(r1After.x - 1.1) < 1e-9);
  // (0.5 - 1.8 + 20) % 20 = 18.7
  assert.ok(Math.abs(r7After.x - 18.7) < 1e-9);

  // Level 5 speed multiplier (1.48) and level 20 capped (2.2)
  const s5 = startNewGame(createInitialState(0));
  s5.level = 5;
  const row1L5 = s5.lanes.find((l) => l.row === 1);
  row1L5.entities = [{ ...row1.entities[0], x: 0 }];
  const afterL5 = stepSimulation(s5, 1000).state.lanes.find((l) => l.row === 1).entities[0];
  assert.ok(Math.abs(afterL5.x - 2.1 * getLevelSpeedMultiplier(5)) < 1e-9);

  const s20 = startNewGame(createInitialState(0));
  s20.level = 20;
  const row1L20 = s20.lanes.find((l) => l.row === 1);
  row1L20.entities = [{ ...row1.entities[0], x: 0 }];
  const afterL20 = stepSimulation(s20, 1000).state.lanes.find((l) => l.row === 1).entities[0];
  assert.ok(Math.abs(afterL20.x - 2.1 * 2.2) < 1e-9);
});

test("3-state turtle diving cycle transitions SURFACE -> SINK_WARN -> SUBMERGED -> SURFACE", () => {
  let state = startNewGame(createInitialState(0));
  const row2 = state.lanes.find((l) => l.row === 2);
  const divingTurtle = row2.entities.find((e) => e.dives && e.diveTimerMs === 0);
  const staggeredTurtle = row2.entities.find((e) => e.dives && e.diveTimerMs === 1800);
  const steadyTurtle = row2.entities.find((e) => !e.dives);

  assert.equal(divingTurtle.diveState, TURTLE_DIVE_STATES.SURFACE);
  assert.equal(staggeredTurtle.diveState, TURTLE_DIVE_STATES.SURFACE);

  // Advance 1700ms: staggered turtle (1800 + 1700 = 3500) enters SINK_WARN; divingTurtle stays SURFACE
  state = stepSimulation(state, 1700).state;
  const r2a = state.lanes.find((l) => l.row === 2).entities;
  assert.equal(r2a.find((e) => e.id === divingTurtle.id).diveState, TURTLE_DIVE_STATES.SURFACE);
  assert.equal(r2a.find((e) => e.id === staggeredTurtle.id).diveState, TURTLE_DIVE_STATES.SINK_WARN);

  // Advance another 1800ms (total 3500ms): divingTurtle -> SINK_WARN; staggeredTurtle (1800 > 1200) -> SUBMERGED
  state = stepSimulation(state, 1800).state;
  const r2b = state.lanes.find((l) => l.row === 2).entities;
  assert.equal(r2b.find((e) => e.id === divingTurtle.id).diveState, TURTLE_DIVE_STATES.SINK_WARN);
  assert.equal(r2b.find((e) => e.id === staggeredTurtle.id).diveState, TURTLE_DIVE_STATES.SUBMERGED);

  // Advance 1200ms (total 4700ms): divingTurtle -> SUBMERGED
  state = stepSimulation(state, 1200).state;
  const r2c = state.lanes.find((l) => l.row === 2).entities;
  assert.equal(r2c.find((e) => e.id === divingTurtle.id).diveState, TURTLE_DIVE_STATES.SUBMERGED);

  // Advance 1400ms (total 6100ms): divingTurtle completes full cycle back to SURFACE
  state = stepSimulation(state, 1400).state;
  const r2d = state.lanes.find((l) => l.row === 2).entities;
  assert.equal(r2d.find((e) => e.id === divingTurtle.id).diveState, TURTLE_DIVE_STATES.SURFACE);
  assert.equal(r2d.find((e) => e.id === divingTurtle.id).diveTimerMs, 0);
  assert.equal(r2d.find((e) => e.id === steadyTurtle.id).diveState, TURTLE_DIVE_STATES.SURFACE);
});

test("road vehicle AABB collisions respect hitbox inset, wrapped entities, and DYING timer", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);

  const row11 = s.lanes.find((l) => l.row === 11); // direction -1, baseSpeed 2.5, wrapWidth 19
  row11.entities = [
    {
      id: "buggy",
      kind: ENTITY_KINDS.BUGGY,
      x: 8.0,
      width: 1.3,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];

  // Frog hops UP onto row 11 at x = 7.0; after 90ms buggy moves -0.225 -> x = 7.775.
  // Frog hitbox [7.15, 7.85] overlaps buggy [7.775, 9.075] -> ROADKILL
  const hopped = queueHop(s, DIRECTIONS.UP).state;
  const hitResult = stepSimulation(hopped, 90);
  assert.equal(hitResult.state.phase, GAME_PHASES.DYING);
  assert.equal(hitResult.state.deathCause, DEATH_CAUSES.ROADKILL);
  assert.equal(hitResult.state.phaseTimerMs, TIMERS.DYING_DURATION_MS);
  assert.equal(hitResult.state.lives, 3); // Decrements after DYING timer expires
  assert.ok(hitResult.events.includes("splat"));

  // Advance DYING timer (500ms -> still DYING; +500ms -> lives=2, respawn at (7, 12))
  const midDying = stepSimulation(hitResult.state, 500).state;
  assert.equal(midDying.phase, GAME_PHASES.DYING);
  assert.equal(midDying.lives, 3);

  const respawned = stepSimulation(midDying, 500).state;
  assert.equal(respawned.phase, GAME_PHASES.PLAYING);
  assert.equal(respawned.lives, 2);
  assert.equal(respawned.deathCause, null);
  assert.equal(respawned.frog.x, FROG_CONFIG.SPAWN_X);
  assert.equal(respawned.frog.row, FROG_CONFIG.SPAWN_ROW);

  // Grazing within 0.15 inset does NOT kill
  const safeState = startNewGame(createInitialState(0));
  clearLanes(safeState);
  safeState.frog.row = ROWS.ROAD_MAX;
  safeState.frog.x = 7.0; // hitbox [7.15, 7.85]
  safeState.lanes.find((l) => l.row === ROWS.ROAD_MAX).entities = [
    {
      id: "near-miss",
      kind: ENTITY_KINDS.BUGGY,
      x: 7.9,
      width: 1.3,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];
  // After 10ms buggy moves -0.025 -> x = 7.875 (> 7.85) -> safe
  const nearMiss = stepSimulation(safeState, 10).state;
  assert.equal(nearMiss.phase, GAME_PHASES.PLAYING);

  // Wrapped vehicle near wrapWidth collides with frog at x = 0.2
  const wrapState = startNewGame(createInitialState(0));
  clearLanes(wrapState);
  wrapState.frog.row = 10; // direction +1, baseSpeed 1.4, wrapWidth 18
  wrapState.frog.x = 0.2; // hitbox [0.35, 1.05]
  wrapState.lanes.find((l) => l.row === 10).entities = [
    {
      id: "wrapped-dozer",
      kind: ENTITY_KINDS.BULLDOZER,
      x: 17.0,
      width: 1.8, // wraps to [-1.0, 0.8)
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];
  const wrapHit = stepSimulation(wrapState, 10);
  assert.equal(wrapHit.state.phase, GAME_PHASES.DYING);
  assert.equal(wrapHit.state.deathCause, DEATH_CAUSES.ROADKILL);
});

test("river riding translates frog smoothly, submerged turtles drown, and mid-air hops do not drown early", () => {
  const s = startNewGame(createInitialState(0));
  clearLanes(s);

  const row3 = s.lanes.find((l) => l.row === 3); // direction +1, baseSpeed 2.7, wrapWidth 22
  row3.entities = [
    {
      id: "ride-log",
      kind: ENTITY_KINDS.LOG,
      x: 5.0,
      width: 4.5,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];

  // Standing on log at x = 7.0 -> rides at exact platform velocity (+2.7 tiles/sec)
  s.frog.row = 3;
  s.frog.startRow = 3;
  s.frog.targetRow = 3;
  s.frog.x = 7.0;
  const rode = stepSimulation(s, 500).state;
  assert.equal(rode.phase, GAME_PHASES.PLAYING);
  assert.ok(Math.abs(rode.frog.x - (7.0 + 2.7 * 0.5)) < 1e-9);

  // Hopping onto water with NO platform does not drown mid-air at 45ms, drowns on landing at 90ms
  const sWater = startNewGame(createInitialState(0));
  clearLanes(sWater);
  sWater.frog.row = ROWS.MEDIAN;
  sWater.frog.startRow = ROWS.MEDIAN;
  sWater.frog.targetRow = ROWS.MEDIAN;
  const hopWater = queueHop(sWater, DIRECTIONS.UP).state;
  const midAir = stepSimulation(hopWater, 45);
  assert.equal(midAir.state.phase, GAME_PHASES.PLAYING);
  assert.equal(midAir.state.frog.hopping, true);

  const landedWater = stepSimulation(midAir.state, 45);
  assert.equal(landedWater.state.phase, GAME_PHASES.DYING);
  assert.equal(landedWater.state.deathCause, DEATH_CAUSES.DROWNED);
  assert.ok(landedWater.events.includes("splash"));

  // Riding a diving turtle survives SINK_WARN, drowns when transitioning to SUBMERGED
  const sTurtle = startNewGame(createInitialState(0));
  clearLanes(sTurtle);
  sTurtle.frog.row = 2; // direction -1, baseSpeed 1.9
  sTurtle.frog.startRow = 2;
  sTurtle.frog.targetRow = 2;
  sTurtle.frog.x = 6.0;
  sTurtle.lanes.find((l) => l.row === 2).entities = [
    {
      id: "diving-t",
      kind: ENTITY_KINDS.TURTLE_GROUP,
      x: 5.5,
      width: 2.0,
      dives: true,
      diveState: TURTLE_DIVE_STATES.SINK_WARN,
      diveTimerMs: TIMERS.TURTLE_SINK_WARN_MS - 100,
    },
  ];

  // 50ms: still SINK_WARN -> frog survives and moves left
  const warnStep = stepSimulation(sTurtle, 50);
  assert.equal(warnStep.state.phase, GAME_PHASES.PLAYING);
  assert.ok(Math.abs(warnStep.state.frog.x - (6.0 - 1.9 * 0.05)) < 1e-9);

  // +60ms: turtle reaches SUBMERGED -> frog drowns
  const submergeStep = stepSimulation(warnStep.state, 60);
  assert.equal(submergeStep.state.phase, GAME_PHASES.DYING);
  assert.equal(submergeStep.state.deathCause, DEATH_CAUSES.DROWNED);
  assert.ok(submergeStep.events.includes("splash"));
});

test("drifting off left or right edge while riding triggers OUT_OF_BOUNDS death", () => {
  // Left edge (< -0.25)
  const sLeft = startNewGame(createInitialState(0));
  clearLanes(sLeft);
  sLeft.frog.row = 5; // direction -1, baseSpeed 2.2, wrapWidth 20
  sLeft.frog.startRow = 5;
  sLeft.frog.targetRow = 5;
  sLeft.frog.x = -0.1;
  sLeft.lanes.find((l) => l.row === 5).entities = [
    {
      id: "left-edge-turtle",
      kind: ENTITY_KINDS.TURTLE_GROUP,
      x: 19.0,
      width: 3.0, // wraps to [-1.0, 2.0)
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];
  // 100ms -> moves -0.22 -> x = -0.32 < -0.25 -> OUT_OF_BOUNDS
  const leftOut = stepSimulation(sLeft, 100);
  assert.equal(leftOut.state.phase, GAME_PHASES.DYING);
  assert.equal(leftOut.state.deathCause, DEATH_CAUSES.OUT_OF_BOUNDS);
  assert.ok(leftOut.events.includes("splash"));

  // Right edge (> 13.25)
  const sRight = startNewGame(createInitialState(0));
  clearLanes(sRight);
  sRight.frog.row = 1; // direction +1, baseSpeed 2.1, wrapWidth 21
  sRight.frog.startRow = 1;
  sRight.frog.targetRow = 1;
  sRight.frog.x = 13.15;
  sRight.lanes.find((l) => l.row === 1).entities = [
    {
      id: "right-edge-log",
      kind: ENTITY_KINDS.LOG,
      x: 12.0,
      width: 3.5,
      dives: false,
      diveState: TURTLE_DIVE_STATES.SURFACE,
      diveTimerMs: 0,
    },
  ];
  // 100ms -> moves +0.21 -> x = 13.36 > 13.25 -> OUT_OF_BOUNDS
  const rightOut = stepSimulation(sRight, 100);
  assert.equal(rightOut.state.phase, GAME_PHASES.DYING);
  assert.equal(rightOut.state.deathCause, DEATH_CAUSES.OUT_OF_BOUNDS);
  assert.ok(rightOut.events.includes("splash"));
});
