let wheelAudioCtx: AudioContext | null = null;

function getWheelAudioContext(): AudioContext | null {
  const AudioCtor = (globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext
    || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!wheelAudioCtx) {
    wheelAudioCtx = new AudioCtor();
  }
  if (wheelAudioCtx.state === "suspended") {
    void wheelAudioCtx.resume();
  }
  return wheelAudioCtx;
}

function playTone(params: {
  frequency: number;
  duration: number;
  volume: number;
  delay?: number;
  type?: OscillatorType;
}): void {
  try {
    const ctx = getWheelAudioContext();
    if (!ctx) return;
    const startAt = ctx.currentTime + Math.max(0, params.delay || 0);
    const duration = Math.max(0.01, params.duration);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = params.type || "sine";
    osc.frequency.setValueAtTime(params.frequency, startAt);
    gain.gain.setValueAtTime(Math.max(0.001, params.volume), startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration);
  } catch {
    // Audio is decorative. Browser autoplay policy or missing Web Audio support should never block gameplay.
  }
}

export function playWheelTick(volume = 0.07): void {
  playTone({
    frequency: 800,
    duration: 0.06,
    volume,
    type: "sine"
  });
}

export function playMysteryGridShuffleTick(progress = 0): void {
  const easedProgress = Math.max(0, Math.min(1, progress));
  playTone({
    frequency: 520 + Math.round(easedProgress * 420),
    duration: 0.045,
    volume: 0.045,
    type: "square"
  });
}

export function playMysteryGridRevealDing(): void {
  [
    { frequency: 659, delay: 0 },
    { frequency: 880, delay: 0.09 },
    { frequency: 1175, delay: 0.18 }
  ].forEach((tone) => {
    playTone({
      frequency: tone.frequency,
      delay: tone.delay,
      duration: 0.16,
      volume: 0.07,
      type: "triangle"
    });
  });
}
