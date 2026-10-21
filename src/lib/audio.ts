// Tones ported from stackmochris/Tools set_timer.html.
let ctx: AudioContext | null = null;
export type Tone = 'start' | 'tick' | 'countdown' | 'done';

export function beep(type: Tone) {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    const plan: Record<Tone, { f: [number, number][]; g: number; d: number }> = {
      start: { f: [[880, 0], [1100, 0.1]], g: 0.35, d: 0.35 },
      tick: { f: [[1000, 0]], g: 0.15, d: 0.07 },
      countdown: { f: [[660, 0]], g: 0.2, d: 0.15 },
      done: { f: [[1320, 0], [1100, 0.15], [880, 0.3]], g: 0.3, d: 0.5 },
    };
    const p = plan[type];
    p.f.forEach(([hz, at]) => osc.frequency.setValueAtTime(hz, t + at));
    gain.gain.setValueAtTime(p.g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + p.d);
    osc.start();
    osc.stop(t + p.d);
  } catch {
    /* audio unavailable */
  }
}

export function buzz(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

export async function wakeLock(): Promise<() => void> {
  try {
    const lock = await (navigator as any).wakeLock?.request('screen');
    return () => lock?.release();
  } catch {
    return () => {};
  }
}
