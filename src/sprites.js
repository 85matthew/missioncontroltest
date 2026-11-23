import { DEATH_CAUSES, DIRECTIONS, ENTITY_KINDS, TURTLE_DIVE_STATES } from "./config.js";

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getFacingAngle(facing) {
  switch (facing) {
    case DIRECTIONS.RIGHT:
      return Math.PI / 2;
    case DIRECTIONS.DOWN:
      return Math.PI;
    case DIRECTIONS.LEFT:
      return -Math.PI / 2;
    case DIRECTIONS.UP:
    default:
      return 0;
  }
}

export function drawFrog(
  ctx,
  x,
  y,
  size,
  {
    facing = DIRECTIONS.UP,
    hopping = false,
    hopProgress = 0,
    dead = false,
    deathCause = null,
    timeMs = 0,
  } = {}
) {
  const cx = x + size / 2;
  const cy = y + size / 2;

  if (dead) {
    ctx.save();
    ctx.translate(cx, cy);
    if (deathCause === DEATH_CAUSES.DROWNED || deathCause === DEATH_CAUSES.OUT_OF_BOUNDS) {
      const pulse = (timeMs % 500) / 500;
      ctx.strokeStyle = "#7ce8ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.18 + pulse * 0.28), 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#d8f8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.08 + pulse * 0.18), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#b8f4ff";
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + pulse * 1.2;
        const dist = size * (0.2 + pulse * 0.2);
        ctx.fillRect(Math.cos(a) * dist - 2, Math.sin(a) * dist - 2, 4, 4);
      }
    } else {
      ctx.fillStyle = "#b81d2a";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      const arm = size * 0.26;
      ctx.beginPath();
      ctx.moveTo(-arm, -arm);
      ctx.lineTo(arm, arm);
      ctx.moveTo(arm, -arm);
      ctx.lineTo(-arm, arm);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const jumpScale = hopping ? 1 + Math.sin(Math.min(1, Math.max(0, hopProgress)) * Math.PI) * 0.16 : 1;
  const legExtend = hopping ? size * 0.08 : 0;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(getFacingAngle(facing));
  ctx.scale(jumpScale, jumpScale);

  // Hind legs
  ctx.fillStyle = "#198c35";
  ctx.fillRect(-size * 0.38, size * 0.06, size * 0.16, size * 0.24 + legExtend);
  ctx.fillRect(size * 0.22, size * 0.06, size * 0.16, size * 0.24 + legExtend);
  ctx.fillRect(-size * 0.42, size * 0.24 + legExtend, size * 0.18, size * 0.08);
  ctx.fillRect(size * 0.24, size * 0.24 + legExtend, size * 0.18, size * 0.08);

  // Front legs
  ctx.fillStyle = "#26b847";
  ctx.fillRect(-size * 0.36, -size * 0.26, size * 0.14, size * 0.18);
  ctx.fillRect(size * 0.22, -size * 0.26, size * 0.14, size * 0.18);

  // Body
  ctx.fillStyle = "#39e75f";
  drawRoundedRect(ctx, -size * 0.24, -size * 0.28, size * 0.48, size * 0.54, size * 0.14);
  ctx.fill();

  // Dorsal highlight stripe
  ctx.fillStyle = "#7bff70";
  drawRoundedRect(ctx, -size * 0.1, -size * 0.18, size * 0.2, size * 0.34, size * 0.06);
  ctx.fill();

  // Yellow-orange belly spots
  ctx.fillStyle = "#f2d64b";
  ctx.fillRect(-size * 0.16, -size * 0.04, size * 0.06, size * 0.12);
  ctx.fillRect(size * 0.1, -size * 0.04, size * 0.06, size * 0.12);

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-size * 0.15, -size * 0.24, size * 0.085, 0, Math.PI * 2);
  ctx.arc(size * 0.15, -size * 0.24, size * 0.085, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(-size * 0.15, -size * 0.26, size * 0.04, 0, Math.PI * 2);
  ctx.arc(size * 0.15, -size * 0.26, size * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawHomeFrog(ctx, x, y, size) {
  drawFrog(ctx, x + size * 0.1, y + size * 0.1, size * 0.8, {
    facing: DIRECTIONS.DOWN,
    hopping: false,
  });
}

export function drawMiniFrogLife(ctx, x, y, size) {
  drawFrog(ctx, x, y, size, {
    facing: DIRECTIONS.UP,
    hopping: false,
  });
}

export function drawBonusFly(ctx, x, y, size, timeMs = 0) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const wingFlap = Math.sin(timeMs * 0.04) * 0.22;

  ctx.save();
  ctx.translate(cx, cy);

  // Translucent wings
  ctx.fillStyle = "rgba(210, 245, 255, 0.85)";
  ctx.save();
  ctx.rotate(-0.45 + wingFlap);
  ctx.beginPath();
  ctx.ellipse(-size * 0.16, -size * 0.08, size * 0.16, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(0.45 - wingFlap);
  ctx.beginPath();
  ctx.ellipse(size * 0.16, -size * 0.08, size * 0.16, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = "#ffd93d";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.02, size * 0.13, size * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#222436";
  ctx.fillRect(-size * 0.1, -size * 0.02, size * 0.2, size * 0.05);
  ctx.fillRect(-size * 0.09, size * 0.07, size * 0.18, size * 0.04);

  // Glowing eyes
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.arc(-size * 0.06, -size * 0.13, size * 0.045, 0, Math.PI * 2);
  ctx.arc(size * 0.06, -size * 0.13, size * 0.045, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawLog(ctx, x, y, width, height) {
  const padY = height * 0.14;
  const bodyH = height - padY * 2;
  const bodyY = y + padY;

  // Main bark body
  ctx.fillStyle = "#8a4b21";
  drawRoundedRect(ctx, x + 2, bodyY, width - 4, bodyH, bodyH * 0.35);
  ctx.fill();

  // Top highlight
  ctx.fillStyle = "#b56b38";
  drawRoundedRect(ctx, x + 6, bodyY + 3, width - 12, bodyH * 0.32, 4);
  ctx.fill();

  // Bottom shadow
  ctx.fillStyle = "#562a0e";
  drawRoundedRect(ctx, x + 6, bodyY + bodyH * 0.72, width - 12, bodyH * 0.22, 4);
  ctx.fill();

  // Bark grain notches
  ctx.fillStyle = "#4d240b";
  for (let gx = x + 22; gx < x + width - 22; gx += 28) {
    ctx.fillRect(gx, bodyY + bodyH * 0.42, 12, 3);
    ctx.fillRect(gx + 10, bodyY + bodyH * 0.6, 8, 2);
  }

  // Cut log ends
  ctx.fillStyle = "#d9a066";
  ctx.beginPath();
  ctx.ellipse(x + 9, bodyY + bodyH / 2, 5, bodyH * 0.4, 0, 0, Math.PI * 2);
  ctx.ellipse(x + width - 9, bodyY + bodyH / 2, 5, bodyH * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7a441f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x + 9, bodyY + bodyH / 2, 2.5, bodyH * 0.2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + width - 9, bodyY + bodyH / 2, 2.5, bodyH * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawTurtleGroup(
  ctx,
  x,
  y,
  width,
  height,
  { diveState = TURTLE_DIVE_STATES.SURFACE, direction = -1, timeMs = 0 } = {}
) {
  const count = Math.max(1, Math.round(width / height));
  const cellW = width / count;

  if (diveState === TURTLE_DIVE_STATES.SUBMERGED) {
    const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.01);
    ctx.save();
    ctx.strokeStyle = `rgba(110, 215, 255, ${0.35 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < count; i += 1) {
      const cx = x + (i + 0.5) * cellW;
      const cy = y + height / 2;
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 3, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 6, cy + 4, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const isWarn = diveState === TURTLE_DIVE_STATES.SINK_WARN;
  const blink = isWarn && Math.floor(timeMs / 140) % 2 === 0;
  const scale = isWarn ? 0.82 : 1;

  for (let i = 0; i < count; i += 1) {
    const cx = x + (i + 0.5) * cellW;
    const cy = y + height / 2;
    const r = Math.min(cellW, height) * 0.34 * scale;
    const dir = direction >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(cx, cy);

    if (isWarn) {
      ctx.strokeStyle = blink ? "#7ee8fa" : "#2e8bc0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Flippers & head
    ctx.fillStyle = isWarn && blink ? "#47b59a" : "#2eb85c";
    const flap = Math.sin(timeMs * 0.012 + i) * 2;
    ctx.fillRect(-r * 0.75, -r * 0.95 + flap * 0.3, r * 0.55, r * 0.35);
    ctx.fillRect(r * 0.2, -r * 0.95 - flap * 0.3, r * 0.55, r * 0.35);
    ctx.fillRect(-r * 0.75, r * 0.6 - flap * 0.3, r * 0.55, r * 0.35);
    ctx.fillRect(r * 0.2, r * 0.6 + flap * 0.3, r * 0.55, r * 0.35);

    // Head pointing in travel direction
    ctx.beginPath();
    ctx.arc(dir * (r * 0.98), 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Shell
    ctx.fillStyle = isWarn ? (blink ? "#9d4035" : "#d94f30") : "#e84a27";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r * 0.76, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shell pattern
    ctx.fillStyle = isWarn ? "#e09f3e" : "#ffb84d";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.45, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export function drawVehicle(
  ctx,
  x,
  y,
  width,
  height,
  { kind, direction = 1 } = {}
) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const facingRight = direction >= 0;

  ctx.save();
  ctx.translate(cx, cy);
  if (!facingRight) {
    ctx.scale(-1, 1);
  }

  const hw = width / 2;
  const hh = height / 2;
  const bodyH = height * 0.68;
  const topY = -bodyH / 2;

  // Wheels helper
  const drawWheels = (offsets) => {
    ctx.fillStyle = "#181820";
    for (const ox of offsets) {
      ctx.fillRect(ox - 5, -hh + 3, 10, 6);
      ctx.fillRect(ox - 5, hh - 9, 10, 6);
    }
  };

  if (kind === ENTITY_KINDS.TRUCK) {
    drawWheels([-hw + 14, -hw + 30, hw - 14]);
    // Cargo trailer
    ctx.fillStyle = "#e6e8f0";
    drawRoundedRect(ctx, -hw + 2, topY, width * 0.68, bodyH, 4);
    ctx.fill();
    ctx.fillStyle = "#d9383a";
    ctx.fillRect(-hw + 6, -3, width * 0.6, 6);
    // Cab
    ctx.fillStyle = "#f26430";
    drawRoundedRect(ctx, -hw + width * 0.72, topY + 2, width * 0.26, bodyH - 4, 4);
    ctx.fill();
    // Windshield
    ctx.fillStyle = "#5ad2f4";
    ctx.fillRect(hw - 14, topY + 6, 7, bodyH - 12);
    // Headlights
    ctx.fillStyle = "#fff3a1";
    ctx.fillRect(hw - 4, topY + 5, 3, 5);
    ctx.fillRect(hw - 4, topY + bodyH - 10, 3, 5);
  } else if (kind === ENTITY_KINDS.RACE_CAR) {
    drawWheels([-hw + 10, hw - 10]);
    // Rear wing
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-hw + 2, topY + 2, 6, bodyH - 4);
    // Sleek chassis
    ctx.fillStyle = "#ff2e63";
    ctx.beginPath();
    ctx.moveTo(-hw + 6, topY + 4);
    ctx.lineTo(hw - 2, -6);
    ctx.lineTo(hw - 2, 6);
    ctx.lineTo(-hw + 6, topY + bodyH - 4);
    ctx.closePath();
    ctx.fill();
    // Racing stripe & cockpit
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-hw + 10, -2, width * 0.65, 4);
    ctx.fillStyle = "#182236";
    ctx.fillRect(-4, -5, 10, 10);
  } else if (kind === ENTITY_KINDS.SEDAN) {
    drawWheels([-hw + 11, hw - 11]);
    ctx.fillStyle = "#9b5de5";
    drawRoundedRect(ctx, -hw + 2, topY + 2, width - 4, bodyH - 4, 7);
    ctx.fill();
    // Roof & glass
    ctx.fillStyle = "#c79bf2";
    drawRoundedRect(ctx, -hw * 0.42, topY + 6, width * 0.48, bodyH - 12, 4);
    ctx.fill();
    ctx.fillStyle = "#5ad2f4";
    ctx.fillRect(hw * 0.14, topY + 7, 7, bodyH - 14);
    // Lights
    ctx.fillStyle = "#ffe66d";
    ctx.fillRect(hw - 5, topY + 5, 3, 5);
    ctx.fillRect(hw - 5, topY + bodyH - 10, 3, 5);
  } else if (kind === ENTITY_KINDS.BULLDOZER) {
    // Heavy treads
    ctx.fillStyle = "#2b2d42";
    ctx.fillRect(-hw + 4, -hh + 3, width * 0.68, 7);
    ctx.fillRect(-hw + 4, hh - 10, width * 0.68, 7);
    // Main chassis
    ctx.fillStyle = "#f4a261";
    drawRoundedRect(ctx, -hw + 6, topY + 4, width * 0.64, bodyH - 8, 3);
    ctx.fill();
    // Cab
    ctx.fillStyle = "#e76f51";
    ctx.fillRect(-hw + 10, topY + 8, width * 0.28, bodyH - 16);
    // Front steel blade
    ctx.fillStyle = "#adb5bd";
    ctx.fillRect(hw - 12, topY, 9, bodyH);
    ctx.fillStyle = "#dee2e6";
    ctx.fillRect(hw - 6, topY + 2, 4, bodyH - 4);
  } else {
    // BUGGY
    drawWheels([-hw + 9, hw - 9]);
    ctx.fillStyle = "#00bbf9";
    drawRoundedRect(ctx, -hw + 3, topY + 4, width - 6, bodyH - 8, 6);
    ctx.fill();
    // Roll cage
    ctx.strokeStyle = "#fee440";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-hw * 0.35, topY + 7, width * 0.42, bodyH - 14);
    ctx.fillStyle = "#fff3a1";
    ctx.fillRect(hw - 5, topY + 6, 3, 4);
    ctx.fillRect(hw - 5, topY + bodyH - 10, 3, 4);
  }

  ctx.restore();
}
