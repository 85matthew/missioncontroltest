import { SCORING } from "./config.js";

export const STORAGE_KEY = "frogger_arcade_v1";
export const SCHEMA_VERSION = 1;

export const DEFAULT_PERSISTED_STATE = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  highScore: 0,
  muted: false,
  crtScanlines: false,
});

const REQUIRED_KEYS = ["schemaVersion", "highScore", "muted", "crtScanlines"];

function cloneDefaults() {
  return { ...DEFAULT_PERSISTED_STATE };
}

function resolveStorage(storageLike) {
  if (storageLike !== undefined) {
    return storageLike && typeof storageLike === "object" ? storageLike : null;
  }
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isValidPersistedState(candidate) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }

  const keys = Object.keys(candidate);
  if (keys.length !== REQUIRED_KEYS.length) {
    return false;
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
      return false;
    }
  }

  if (candidate.schemaVersion !== SCHEMA_VERSION) {
    return false;
  }

  if (
    typeof candidate.highScore !== "number" ||
    !Number.isInteger(candidate.highScore) ||
    !Number.isFinite(candidate.highScore) ||
    candidate.highScore < 0 ||
    candidate.highScore > SCORING.MAX_SCORE
  ) {
    return false;
  }

  if (typeof candidate.muted !== "boolean") {
    return false;
  }

  if (typeof candidate.crtScanlines !== "boolean") {
    return false;
  }

  return true;
}

function resetStoredDefaults(storage) {
  try {
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PERSISTED_STATE));
    }
  } catch {
    // Ignore storage write errors during recovery.
  }
}

export function loadPersistedState(storageLike) {
  const storage = resolveStorage(storageLike);
  if (!storage || typeof storage.getItem !== "function") {
    return cloneDefaults();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) {
      return cloneDefaults();
    }
    if (typeof raw !== "string") {
      resetStoredDefaults(storage);
      return cloneDefaults();
    }

    const parsed = JSON.parse(raw);
    if (!isValidPersistedState(parsed)) {
      resetStoredDefaults(storage);
      return cloneDefaults();
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      highScore: parsed.highScore === 0 ? 0 : parsed.highScore,
      muted: parsed.muted,
      crtScanlines: parsed.crtScanlines,
    };
  } catch {
    resetStoredDefaults(storage);
    return cloneDefaults();
  }
}

export function savePersistedState(payload, storageLike) {
  if (!isValidPersistedState(payload)) {
    return false;
  }

  const storage = resolveStorage(storageLike);
  if (!storage || typeof storage.setItem !== "function") {
    return false;
  }

  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    highScore: payload.highScore === 0 ? 0 : payload.highScore,
    muted: payload.muted,
    crtScanlines: payload.crtScanlines,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
