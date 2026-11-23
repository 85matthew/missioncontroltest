function resolveDefaultAudioContextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

export function createSoundEngine({ AudioContextClass, initialMuted = false } = {}) {
  const ContextCtor = AudioContextClass === undefined ? resolveDefaultAudioContextClass() : AudioContextClass;
  let ctx = null;
  let audioBlocked = false;
  let muted = Boolean(initialMuted);

  function ensureContext() {
    if (audioBlocked || !ContextCtor) {
      return null;
    }
    if (!ctx) {
      try {
        ctx = new ContextCtor();
      } catch {
        audioBlocked = true;
        ctx = null;
        return null;
      }
    }
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        const maybePromise = ctx.resume();
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(() => {});
        }
      } catch {
        // Ignore resume errors in autoplay-restricted environments.
      }
    }
    return ctx;
  }

  function scheduleTone({
    type = "square",
    freqStart = 440,
    freqEnd = freqStart,
    startOffset = 0,
    duration = 0.1,
    volume = 0.12,
  }) {
    if (!ctx || typeof ctx.createOscillator !== "function" || typeof ctx.createGain !== "function") {
      return;
    }
    const now = (typeof ctx.currentTime === "number" ? ctx.currentTime : 0) + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    if (osc.frequency && typeof osc.frequency.setValueAtTime === "function") {
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart && typeof osc.frequency.exponentialRampToValueAtTime === "function") {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
      }
    } else if (osc.frequency) {
      osc.frequency.value = freqStart;
    }

    if (gain.gain && typeof gain.gain.setValueAtTime === "function") {
      gain.gain.setValueAtTime(volume, now);
      if (typeof gain.gain.exponentialRampToValueAtTime === "function") {
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      }
    } else if (gain.gain) {
      gain.gain.value = volume;
    }

    osc.connect(gain);
    if (ctx.destination) {
      gain.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + duration);
  }

  function scheduleNoiseBurst({ duration = 0.16, volume = 0.12, startOffset = 0, filterFreq = 900 }) {
    if (
      !ctx ||
      typeof ctx.createBuffer !== "function" ||
      typeof ctx.createBufferSource !== "function" ||
      typeof ctx.createGain !== "function"
    ) {
      return;
    }
    const sampleRate = typeof ctx.sampleRate === "number" && ctx.sampleRate > 0 ? ctx.sampleRate : 22050;
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    if (typeof buffer.getChannelData === "function") {
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i += 1) {
        data[i] = (i % 7 === 0 ? 1 : -1) * (1 - i / frameCount) * 0.6;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const now = (typeof ctx.currentTime === "number" ? ctx.currentTime : 0) + startOffset;
    if (gain.gain && typeof gain.gain.setValueAtTime === "function") {
      gain.gain.setValueAtTime(volume, now);
      if (typeof gain.gain.exponentialRampToValueAtTime === "function") {
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      }
    }

    if (typeof ctx.createBiquadFilter === "function") {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      if (filter.frequency && typeof filter.frequency.setValueAtTime === "function") {
        filter.frequency.setValueAtTime(filterFreq, now);
      }
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }

    if (ctx.destination) {
      gain.connect(ctx.destination);
    }

    source.start(now);
    source.stop(now + duration);
  }

  function playSequence(notes, { type = "square", step = 0.08, noteDuration = 0.09, volume = 0.1 } = {}) {
    notes.forEach((freq, idx) => {
      scheduleTone({
        type,
        freqStart: freq,
        freqEnd: freq,
        startOffset: idx * step,
        duration: noteDuration,
        volume,
      });
    });
  }

  return {
    unlock() {
      return Boolean(ensureContext());
    },

    setMuted(nextMuted) {
      muted = Boolean(nextMuted);
    },

    isMuted() {
      return muted;
    },

    play(eventName) {
      if (muted || typeof eventName !== "string") {
        return;
      }
      if (!ensureContext()) {
        return;
      }

      try {
        switch (eventName) {
          case "hop":
            scheduleTone({ type: "square", freqStart: 250, freqEnd: 540, duration: 0.075, volume: 0.09 });
            break;

          case "splash":
            scheduleTone({ type: "triangle", freqStart: 460, freqEnd: 120, duration: 0.3, volume: 0.14 });
            scheduleNoiseBurst({ duration: 0.24, volume: 0.11, filterFreq: 1200 });
            break;

          case "splat":
            scheduleTone({ type: "sawtooth", freqStart: 190, freqEnd: 52, duration: 0.25, volume: 0.14 });
            scheduleNoiseBurst({ duration: 0.15, volume: 0.12, filterFreq: 700 });
            break;

          case "home":
            playSequence([523.25, 659.25, 783.99], { type: "square", step: 0.065, noteDuration: 0.09, volume: 0.1 });
            break;

          case "bonus":
            playSequence([783.99, 987.77, 1174.66, 1567.98], {
              type: "square",
              step: 0.055,
              noteDuration: 0.085,
              volume: 0.1,
            });
            break;

          case "roundClear":
            playSequence([523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5], {
              type: "square",
              step: 0.085,
              noteDuration: 0.12,
              volume: 0.11,
            });
            break;

          case "extraLife":
            playSequence([659.25, 783.99, 1318.51, 1046.5, 1174.66, 1567.98], {
              type: "square",
              step: 0.07,
              noteDuration: 0.09,
              volume: 0.1,
            });
            break;

          case "timeWarn":
            playSequence([880, 660], { type: "square", step: 0.09, noteDuration: 0.07, volume: 0.09 });
            break;

          case "gameOver":
            playSequence([392.0, 329.63, 261.63, 196.0], {
              type: "sawtooth",
              step: 0.16,
              noteDuration: 0.2,
              volume: 0.11,
            });
            break;

          default:
            break;
        }
      } catch {
        // Fail silently if Web Audio nodes throw at runtime.
      }
    },
  };
}
