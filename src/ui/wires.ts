import type { Simulator } from '../engine/sim';
import type { Wire } from '../engine/types';

/** 線色（依接線圖：正極紅、負極黑，其餘依用途自選） */
export const WIRE_COLORS: [string, string][] = [
  ['#e03131', '紅'],
  ['#343a40', '黑'],
  ['#1971c2', '藍'],
  ['#2f9e44', '綠'],
  ['#f08c00', '橘'],
  ['#e8b100', '黃'],
  ['#c2255c', '桃紅'],
  ['#7048e8', '紫'],
  ['#868e96', '灰'],
];

/** 沒有指定線色時：接電源正極用紅、負極用黑，其餘藍色 */
export function wireColor(sim: Simulator, w: Wire) {
  if (w.color) return w.color;
  const ends = [w.from, w.to].map((e) => {
    const d = sim.devices.find((x) => x.id === e.device);
    return d?.type === 'power' ? e.port : '';
  });
  if (ends.includes('P')) return '#e03131';
  if (ends.includes('N')) return '#343a40';
  return '#1971c2';
}

