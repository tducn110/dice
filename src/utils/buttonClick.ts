/**
 * Minimal WebAudio button click SFX — zero asset dependencies.
 * Plays a short synthetic click beep appropriate for board game UI.
 */
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctor) _ctx = new Ctor();
  }
  if (_ctx && _ctx.state === "suspended") {
    void _ctx.resume();
  }
  return _ctx;
}

/** Play a subtle UI button click. Safe to call anytime; no-ops if audio unavailable. */
export function playButtonClick(): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // Audio is non-critical.
  }
}
