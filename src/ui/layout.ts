import type { DeviceInstance } from '../engine/types';
import { relayGroups } from '../engine/devices';

export type Side = 'left' | 'right' | 'top' | 'bottom' | 'none';

export interface PortPos {
  x: number;
  y: number;
  side: Side;
  /** 端子旁顯示的短標籤 */
  tag: string;
}

export interface Layout {
  w: number;
  h: number;
  ports: Record<string, PortPos>;
  /** 端子分組標題（主機端子台用） */
  groups?: { x1: number; x2: number; label: string }[];
}

const row = (ids: [string, string][], y: number, side: Side, xs: number[]): Record<string, PortPos> =>
  Object.fromEntries(ids.map(([id, tag], i) => [id, { x: xs[i], y, side, tag }]));

const spread = (n: number, w: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 1) * w) / (n + 1)));

/** 繼電器座端子排列（依 8 腳／14 腳繼電器座實物） */
export function socketGrid(groups: number): (string | null)[][] {
  const g = relayGroups(groups);
  const has = (pin: number) => g.includes(((pin - 1) % 4) + 1) || pin === 13 || pin === 14;
  const big = groups > 2;
  const grid: (number | null)[][] = big
    ? [
        [null, 3, 2, 1],
        [8, 7, 6, 5],
        [12, 11, 10, 9],
        [4, 14, 13, null],
      ]
    : [
        [null, 4, 1],
        [8, null, 5],
        [12, null, 9],
        [14, 13, null],
      ];
  return grid.map((r) => r.map((pin) => (pin !== null && has(pin) ? String(pin) : null)));
}
export const SOCKET = { cell: 26, rows: [14, 40, 154, 180], h: 194, labelTop: 54, labelBottom: 140 };

/** 各設備的外框大小與端子位置（未縮放） */
export function layoutOf(d: DeviceInstance): Layout {
  const p = d.params;
  switch (d.type) {
    case 'cvia92': {
      // 端子台在底部：KEY 白紅黃綠｜SENSOR COM 紅外線 SM｜馬達 上停下共｜RELAY NO COM
      const groups: [string, [string, string][]][] = [
        ['KEY', [['KEY_W', '白'], ['KEY_R', '紅'], ['KEY_Y', '黃'], ['KEY_G', '綠']]],
        ['SENSOR', [['SCOM', 'COM'], ['IR', 'IR'], ['SM', 'SM']]],
        ['馬達', [['UP', '上'], ['STOP', '停'], ['DOWN', '下'], ['MCOM', '共']]],
        ['RELAY', [['RNO', 'NO'], ['RCOM', 'COM']]],
      ];
      const w = 380;
      const h = 400;
      const gap = 25;
      const ggap = 12;
      let x = 24;
      const ports: Record<string, PortPos> = {};
      const g: Layout['groups'] = [];
      for (const [label, ids] of groups) {
        const x1 = x;
        for (const [id, tag] of ids) {
          ports[id] = { x, y: h - 12, side: 'bottom', tag };
          x += gap;
        }
        g.push({ x1, x2: x - gap, label });
        x += ggap;
      }
      return { w, h, ports, groups: g };
    }
    case 'remote':
      return { w: 130, h: 220, ports: {} };
    case 'power':
      return { w: 140, h: 110, ports: row([['P', p.kind === 'DC' ? '+' : 'L'], ['N', p.kind === 'DC' ? '−' : 'N']], 110, 'bottom', [90, 120]) };
    case 'pushButton':
    case 'toggleSwitch':
    case 'cardReader':
      return { w: 110, h: 76, ports: row([['COM', 'COM'], ['NO', 'NO'], ['NC', 'NC']], 0, 'top', spread(3, 110)) };
    case 'loopDetector':
    case 'irSensor':
      return { w: 140, h: 86, ports: row([['COM', 'COM'], ['NO', 'NO'], ['NC', 'NC']], 0, 'top', spread(3, 140)) };
    case 'gate':
      return {
        w: 280,
        h: 170,
        ports: row(
          [
            ['UP', '上'],
            ['STOP', '停'],
            ['DOWN', '下'],
            ['COM', '共'],
            ['LCOM', '限共'],
            ['OL', '上限'],
            ['CL', '下限'],
          ],
          170,
          'bottom',
          [28, 58, 88, 118, 178, 213, 248],
        ),
      };
    case 'lamp':
      return { w: 90, h: 96, ports: row([['P', '+'], ['COM', 'COM']], 96, 'bottom', [28, 62]) };
    case 'buzzer':
      return { w: 90, h: 86, ports: row([['P', '+'], ['COM', 'COM']], 86, 'bottom', [28, 62]) };
    case 'trafficLight':
      return { w: 90, h: 120, ports: row([['R', '紅'], ['G', '綠'], ['COM', 'COM']], 120, 'bottom', [20, 45, 70]) };
    case 'relay':
    case 'timer': {
      const grid = socketGrid(p.groups);
      const cols = grid[0].length;
      const w = cols * SOCKET.cell + 6;
      const ports: Record<string, PortPos> = {};
      grid.forEach((r, ri) =>
        r.forEach((pin, ci) => {
          if (pin) ports[pin] = { x: 3 + ci * SOCKET.cell + SOCKET.cell / 2, y: SOCKET.rows[ri], side: ri < 2 ? 'top' : 'bottom', tag: pin };
        }),
      );
      return { w, h: SOCKET.h, ports };
    }
    case 'node':
      return { w: 0, h: 0, ports: { P: { x: 0, y: 0, side: 'none', tag: '' } } };
  }
  return { w: 100, h: 60, ports: {} };
}

export const scaleOf = (d: DeviceInstance) => d.scale ?? 1;

/** 端子在畫布上的位置 */
export function portWorld(d: DeviceInstance, port: string, lay = layoutOf(d)) {
  const pp = lay.ports[port];
  const s = scaleOf(d);
  if (!pp) return { x: d.x, y: d.y, side: 'none' as Side };
  return { x: d.x + pp.x * s, y: d.y + pp.y * s, side: pp.side };
}

/** 設備在畫布上占用的範圍（含上方名稱） */
export function boxOf(d: DeviceInstance, lay = layoutOf(d)) {
  const s = scaleOf(d);
  if (d.type === 'node') return { x1: d.x - 6, y1: d.y - 6, x2: d.x + 6, y2: d.y + 6 };
  return titleBelow(d)
    ? { x1: d.x, y1: d.y, x2: d.x + lay.w * s, y2: d.y + lay.h * s + 18 }
    : { x1: d.x, y1: d.y - 18, x2: d.x + lay.w * s, y2: d.y + lay.h * s };
}

/** 端子在上方的設備，名稱寫在下方 */
export function titleBelow(d: DeviceInstance) {
  return ['pushButton', 'toggleSwitch', 'cardReader', 'loopDetector', 'irSensor'].includes(d.type);
}
