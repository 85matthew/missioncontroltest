import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ENTITY_KINDS,
  GAME_PHASES,
  GRID_COLS,
  HUD_BOTTOM_HEIGHT,
  HUD_TOP_HEIGHT,
  LANE_ZONES,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  ROWS,
  TILE_SIZE,
  TIMERS,
} from "./config.js";
import {
  drawBonusFly,
  drawFrog,
  drawHomeFrog,
  drawLog,
  drawMiniFrogLife,
  drawTurtleGroup,
  drawVehicle,
} from "./sprites.js";

const FONT_MONO = '"Courier New", Courier, monospace';

function formatScore(value) {
  const safe = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return String(safe).padStart(6, "0");
}

function rowToPixelY(row) {
  return HUD_TOP_HEIGHT + row * TILE_SIZE;
}

function drawTopHud(ctx, state) {
  ctx.fillStyle = "#060714";
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_TOP_HEIGHT);

  ctx.fillStyle = "#2b325c";
  ctx.fillRect(0, HUD_TOP_HEIGHT - 2, CANVAS_WIDTH, 2);

  ctx.font = `bold 13px ${FONT_MONO}`;
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff4d6d";
  ctx.fillText("1-UP", 20, 8);
  ctx.fillStyle = "#f4f6ff";
  ctx.font = `bold 20px ${FONT_MONO}`;
  ctx.fillText(formatScore(state.score), 20, 26);

  ctx.textAlign = "center";
  ctx.font = `bold 13px ${FONT_MONO}`;
  ctx.fillStyle = "#ffd166";
  ctx.fillText("HI-SCORE", CANVAS_WIDTH / 2, 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 20px ${FONT_MONO}`;
  ctx.fillText(formatScore(state.highScore), CANVAS_WIDTH / 2, 26);

  ctx.textAlign = "right";
  ctx.font = `bold 13px ${FONT_MONO}`;
  ctx.fillStyle = "#4cc9f0";
  ctx.fillText("STAGE", CANVAS_WIDTH - 20, 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 20px ${FONT_MONO}`;
  ctx.fillText(String(state.level).padStart(2, "0"), CANVAS_WIDTH - 20, 26);
}

function drawPlayfieldBackground(ctx, timeMs) {
  // River zone (Rows 1..5)
  const riverY = rowToPixelY(ROWS.RIVER_MIN);
  const riverH = (ROWS.RIVER_MAX - ROWS.RIVER_MIN + 1) * TILE_SIZE;
  ctx.fillStyle = "#040d4a";
  ctx.fillRect(0, riverY, PLAYFIELD_WIDTH, riverH);

  // Subtle animated water shimmer lines
  ctx.fillStyle = "rgba(64, 156, 255, 0.14)";
  const shimmerOffset = (timeMs * 0.025) % 64;
  for (let r = ROWS.RIVER_MIN; r <= ROWS.RIVER_MAX; r += 1) {
    const y = rowToPixelY(r) + 12;
    for (let x = -64 + ((r % 2) * 32) + shimmerOffset; x < PLAYFIELD_WIDTH; x += 64) {
      ctx.fillRect(x, y, 22, 2);
      ctx.fillRect(x + 28, y + 22, 16, 2);
    }
  }

  // Goal bank foliage strip (Row 0)
  const goalY = rowToPixelY(ROWS.GOAL_BANK);
  ctx.fillStyle = "#0e5e22";
  ctx.fillRect(0, goalY, PLAYFIELD_WIDTH, TILE_SIZE);
  ctx.fillStyle = "#198734";
  for (let gx = 0; gx < PLAYFIELD_WIDTH; gx += 16) {
    ctx.fillRect(gx + 2, goalY + 4, 10, 10);
    ctx.fillRect(gx + 6, goalY + 26, 10, 12);
  }
  ctx.fillStyle = "#093d15";
  ctx.fillRect(0, goalY + TILE_SIZE - 4, PLAYFIELD_WIDTH, 4);

  // Median & Start curb strips (Row 6 and Row 12)
  for (const curbRow of [ROWS.MEDIAN, ROWS.START]) {
    const y = rowToPixelY(curbRow);
    ctx.fillStyle = "#5a2282";
    ctx.fillRect(0, y, PLAYFIELD_WIDTH, TILE_SIZE);
    ctx.fillStyle = "#8a3fc2";
    ctx.fillRect(0, y, PLAYFIELD_WIDTH, 4);
    ctx.fillRect(0, y + TILE_SIZE - 4, PLAYFIELD_WIDTH, 4);
    ctx.fillStyle = "#461869";
    for (let cx = 6; cx < PLAYFIELD_WIDTH; cx += 24) {
      ctx.fillRect(cx, y + 12, 10, 8);
      ctx.fillRect(cx + 12, y + 28, 10, 8);
    }
  }

  // Road zone (Rows 7..11)
  const roadY = rowToPixelY(ROWS.ROAD_MIN);
  const roadH = (ROWS.ROAD_MAX - ROWS.ROAD_MIN + 1) * TILE_SIZE;
  ctx.fillStyle = "#12131c";
  ctx.fillRect(0, roadY, PLAYFIELD_WIDTH, roadH);

  // Dashed lane lines between road lanes
  ctx.fillStyle = "rgba(255, 222, 89, 0.45)";
  for (let r = ROWS.ROAD_MIN; r < ROWS.ROAD_MAX; r += 1) {
    const lineY = rowToPixelY(r + 1) - 1;
    for (let lx = 8; lx < PLAYFIELD_WIDTH; lx += 36) {
      ctx.fillRect(lx, lineY, 18, 2);
    }
  }
}

function drawHomeBays(ctx, homeBays, timeMs) {
  const goalY = rowToPixelY(ROWS.GOAL_BANK);
  for (const bay of homeBays) {
    const bayX = bay.centerX * TILE_SIZE;
    // Water alcove inside riverbank
    ctx.fillStyle = "#040d4a";
    ctx.fillRect(bayX + 2, goalY + 6, TILE_SIZE - 4, TILE_SIZE - 6);
    ctx.strokeStyle = "#29b34a";
    ctx.lineWidth = 2;
    ctx.strokeRect(bayX + 2, goalY + 6, TILE_SIZE - 4, TILE_SIZE - 6);

    if (bay.occupied) {
      drawHomeFrog(ctx, bayX, goalY + 4, TILE_SIZE);
    } else if (bay.hasFly) {
      drawBonusFly(ctx, bayX, goalY + 4, TILE_SIZE, timeMs);
    }
  }
}

function drawLaneEntities(ctx, lanes, timeMs) {
  for (const lane of lanes) {
    const y = rowToPixelY(lane.row);
    for (const entity of lane.entities) {
      const candidateOffsets = [0];
      if (entity.x + entity.width > lane.wrapWidth) {
        candidateOffsets.push(-lane.wrapWidth);
      }

      for (const offset of candidateOffsets) {
        const drawX = entity.x + offset;
        if (drawX + entity.width <= 0 || drawX >= GRID_COLS) {
          continue;
        }
        const px = drawX * TILE_SIZE;
        const pw = entity.width * TILE_SIZE;

        if (lane.zone === LANE_ZONES.RIVER) {
          if (entity.kind === ENTITY_KINDS.LOG) {
            drawLog(ctx, px, y, pw, TILE_SIZE);
          } else {
            drawTurtleGroup(ctx, px, y, pw, TILE_SIZE, {
              diveState: entity.diveState,
              direction: lane.direction,
              timeMs,
            });
          }
        } else {
          drawVehicle(ctx, px, y, pw, TILE_SIZE, {
            kind: entity.kind,
            direction: lane.direction,
            timeMs,
          });
        }
      }
    }
  }
}

function drawActiveFrog(ctx, state, timeMs) {
  if (state.phase === GAME_PHASES.TITLE || state.phase === GAME_PHASES.GAME_OVER) {
    return;
  }

  const frog = state.frog;
  const px = frog.x * TILE_SIZE;
  const py = rowToPixelY(frog.row);
  const hopProgress = frog.hopping && frog.hopDurationMs > 0
    ? frog.hopElapsedMs / frog.hopDurationMs
    : 0;

  drawFrog(ctx, px, py, TILE_SIZE, {
    facing: frog.facing,
    hopping: frog.hopping,
    hopProgress,
    dead: state.phase === GAME_PHASES.DYING,
    deathCause: state.deathCause,
    timeMs,
  });
}

function drawBottomHud(ctx, state, timeMs) {
  const y = HUD_TOP_HEIGHT + PLAYFIELD_HEIGHT;
  ctx.fillStyle = "#060714";
  ctx.fillRect(0, y, CANVAS_WIDTH, HUD_BOTTOM_HEIGHT);

  ctx.fillStyle = "#2b325c";
  ctx.fillRect(0, y, CANVAS_WIDTH, 2);

  // Lives indicator
  ctx.font = `bold 12px ${FONT_MONO}`;
  ctx.fillStyle = "#a5b4fc";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LIVES", 16, y + HUD_BOTTOM_HEIGHT / 2);

  const visibleLives = Math.min(state.lives, 7);
  for (let i = 0; i < visibleLives; i += 1) {
    drawMiniFrogLife(ctx, 64 + i * 26, y + 12, 24);
  }
  if (state.lives > 7) {
    ctx.fillStyle = "#39e75f";
    ctx.fillText(`+${state.lives - 7}`, 64 + 7 * 26, y + HUD_BOTTOM_HEIGHT / 2);
  }

  // Countdown timer bar
  const ratio = state.timeLimitMs > 0
    ? Math.max(0, Math.min(1, state.timeRemainingMs / state.timeLimitMs))
    : 0;
  const isLow = state.timeRemainingMs <= TIMERS.LOW_TIME_WARN_MS && state.phase === GAME_PHASES.PLAYING;
  const flashRed = isLow && Math.floor(timeMs / 180) % 2 === 0;

  const barW = 240;
  const barH = 16;
  const barX = CANVAS_WIDTH - barW - 76;
  const barY = y + (HUD_BOTTOM_HEIGHT - barH) / 2;

  ctx.fillStyle = "#161933";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = "#3c4578";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  const fillW = Math.max(0, (barW - 4) * ratio);
  ctx.fillStyle = isLow ? (flashRed ? "#ff2e63" : "#ff9f1c") : "#39e75f";
  ctx.fillRect(barX + 2 + (barW - 4 - fillW), barY + 2, fillW, barH - 4);

  const secondsLeft = Math.ceil(state.timeRemainingMs / 1000);
  ctx.textAlign = "right";
  ctx.font = `bold 15px ${FONT_MONO}`;
  ctx.fillStyle = isLow ? "#ff4d6d" : "#ffd166";
  ctx.fillText(`TIME ${String(secondsLeft).padStart(2, "0")}`, CANVAS_WIDTH - 16, y + HUD_BOTTOM_HEIGHT / 2);
}

function drawCenterPanel(ctx, boxW, boxH) {
  const bx = (CANVAS_WIDTH - boxW) / 2;
  const by = HUD_TOP_HEIGHT + (PLAYFIELD_HEIGHT - boxH) / 2;

  ctx.fillStyle = "rgba(6, 8, 22, 0.88)";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = "#39e75f";
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, boxW, boxH);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 5, by + 5, boxW - 10, boxH - 10);

  return { bx, by, cx: CANVAS_WIDTH / 2 };
}

function drawPhaseOverlay(ctx, state, timeMs) {
  if (state.phase === GAME_PHASES.PLAYING || state.phase === GAME_PHASES.DYING) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(2, 4, 14, 0.56)";
  ctx.fillRect(0, HUD_TOP_HEIGHT, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);

  const blink = Math.floor(timeMs / 450) % 2 === 0;

  if (state.phase === GAME_PHASES.TITLE) {
    const { by, cx } = drawCenterPanel(ctx, 480, 340);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `bold 52px ${FONT_MONO}`;
    ctx.fillStyle = "#39e75f";
    ctx.fillText("FROGGER", cx, by + 58);

    ctx.font = `bold 15px ${FONT_MONO}`;
    ctx.fillStyle = "#ffd166";
    ctx.fillText("1981 ARCADE EDITION", cx, by + 98);

    ctx.font = `bold 14px ${FONT_MONO}`;
    ctx.fillStyle = "#cbd5ff";
    ctx.fillText("FORWARD HOP +10   |   HOME BAY +50", cx, by + 150);
    ctx.fillText("BONUS FLY +200    |   STAGE CLEAR +1000", cx, by + 178);
    ctx.fillText("EXTRA FROG AT 20,000 PTS", cx, by + 206);

    ctx.fillStyle = "#7ce8ff";
    ctx.fillText("MOVE: ARROWS / WASD  |  PAUSE: P / ESC", cx, by + 250);

    if (blink) {
      ctx.font = `bold 18px ${FONT_MONO}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("PRESS ENTER OR SPACE TO START", cx, by + 298);
    }
  } else if (state.phase === GAME_PHASES.PAUSED) {
    const { by, cx } = drawCenterPanel(ctx, 360, 150);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `bold 36px ${FONT_MONO}`;
    ctx.fillStyle = "#ffd166";
    ctx.fillText("PAUSED", cx, by + 56);

    ctx.font = `bold 15px ${FONT_MONO}`;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("PRESS P OR ESC TO RESUME", cx, by + 106);
  } else if (state.phase === GAME_PHASES.ROUND_CLEAR) {
    const { by, cx } = drawCenterPanel(ctx, 410, 160);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `bold 34px ${FONT_MONO}`;
    ctx.fillStyle = "#39e75f";
    ctx.fillText(`STAGE ${state.level} CLEAR!`, cx, by + 56);

    ctx.font = `bold 18px ${FONT_MONO}`;
    ctx.fillStyle = "#ffd166";
    ctx.fillText("+1000 ROUND CLEAR BONUS", cx, by + 108);
  } else if (state.phase === GAME_PHASES.GAME_OVER) {
    const { by, cx } = drawCenterPanel(ctx, 420, 230);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `bold 40px ${FONT_MONO}`;
    ctx.fillStyle = "#ff4d6d";
    ctx.fillText("GAME OVER", cx, by + 56);

    ctx.font = `bold 18px ${FONT_MONO}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`FINAL SCORE: ${formatScore(state.score)}`, cx, by + 106);

    if (state.score > 0 && state.score >= state.highScore) {
      ctx.fillStyle = "#ffd166";
      ctx.fillText("NEW HI-SCORE!", cx, by + 140);
    }

    if (blink) {
      ctx.font = `bold 16px ${FONT_MONO}`;
      ctx.fillStyle = "#7ce8ff";
      ctx.fillText("PRESS ENTER OR SPACE TO RETRY", cx, by + 186);
    }
  }

  ctx.restore();
}

export function renderFrame(ctx, state, timeMs = 0) {
  if (!ctx || !state) {
    return;
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawTopHud(ctx, state);
  drawPlayfieldBackground(ctx, timeMs);
  drawHomeBays(ctx, state.homeBays, timeMs);
  drawLaneEntities(ctx, state.lanes, timeMs);
  drawActiveFrog(ctx, state, timeMs);
  drawBottomHud(ctx, state, timeMs);
  drawPhaseOverlay(ctx, state, timeMs);
}

export function createRenderer(canvas) {
  const ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  return {
    render(state, timeMs = 0) {
      renderFrame(ctx, state, timeMs);
    },
  };
}
