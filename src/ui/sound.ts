import type { BeepKind } from '../engine/host';

let ctx: AudioContext | null = null;

/** 模擬主機蜂鳴器：長音、長音加兩短音、一聲、二聲、三聲、五聲 */
export function playBeep(kind: BeepKind) {
  try {
    ctx ??= new AudioContext();
    const pattern = kind === 'long' ? [0.6] : kind === 'long2' ? [0.6, 0.09, 0.09] : Array(Number(kind)).fill(0.09);
    let t = ctx.currentTime + 0.01;
    for (const len of pattern) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 2700;
      o.type = 'square';
      g.gain.value = 0.04;
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + len);
      t += len + (len > 0.3 ? 0.15 : 0.08);
    }
  } catch {
    /* 瀏覽器不支援音效時略過 */
  }
}
