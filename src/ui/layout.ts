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

/** 圖片設備的尺寸換算：原圖裁切範圍內的像素座標 → 畫布座標 */
const imgScale = (cropX: number, k: number) => (x: number) => Math.round((x - cropX) * k * 10) / 10;

/** 全功能主機圖（原圖裁切 x 400~1735、y 180~2160） */
const HK = 320 / 1335;
const hx = imgScale(400, HK);
export const HOST_IMG = {
  w: 320,
  h: Math.round(1980 * HK),
  /** 圖上 16 個端子由左到右；沒有對應功能的端子為 null */
  ports: [
    ['KEY_W', '白'],
    ['KEY_R', '紅'],
    ['KEY_Y', '黃'],
    ['KEY_G', '綠'],
    ['SCOM', 'G'],
    ['IR', 'IR'],
    ['SM', 'SM'],
    [null, '上 NC'],
    ['UP', '上 NO'],
    [null, '下 NC'],
    ['DOWN', '下 NO'],
    ['STOP', '停 NO'],
    ['MCOM', '共 G'],
    [null, 'RELAY4 NC'],
    ['RCOM', 'RELAY4 G'],
    ['RNO', 'RELAY4 NO'],
  ] as [string | null, string][],
  portX: [472.5, 545, 617.5, 690.5, 773.5, 846, 918.5, 1025.5, 1098.5, 1169, 1241.5, 1314, 1386.5, 1494, 1567.5, 1638.5].map(hx),
  portY: Math.round((2083 - 180) * HK * 10) / 10,
  portR: 10,
  /** 顯示窗 */
  win: { x1: hx(602), x2: hx(1526), y1: Math.round((424 - 180) * HK), y2: Math.round((803 - 180) * HK) },
  /** 四顆指示燈 */
  ledX: [785, 970, 1155, 1340].map(hx),
  ledY: Math.round((953 - 180) * HK * 10) / 10,
  ledR: 7.4,
};

/** 柵欄機圖（原圖裁切 x 210~1635、y 2780~5435；柵欄桿另外畫） */
const GK = 0.13;
const gx = imgScale(210, GK);
const ARM = 170;
export const GATE_IMG = {
  arm: ARM,
  imgW: Math.round(1425 * GK * 10) / 10,
  imgH: Math.round(2655 * GK * 10) / 10,
  w: Math.round(Math.max(1425 * GK, gx(900) + ARM + 6)),
  h: Math.round(ARM + 2655 * GK),
  pivotX: gx(900),
  pivotY: ARM + 2,
  armW: 16,
  ports: [
    ['UP', '上'],
    ['STOP', '停'],
    ['DOWN', '下'],
    ['COM', '共'],
    ['OL', '上極限'],
    ['CL', '下極限'],
    ['LCOM', '極限共'],
    [null, 'IR'],
    [null, '感應線圈'],
    [null, 'G'],
  ] as [string | null, string][],
  portX: [311, 432.5, 553, 673.5, 856, 977.5, 1098.5, 1274, 1395, 1515.5].map(gx),
  portY: Math.round((ARM + (5324.5 - 2780) * GK) * 10) / 10,
  portR: 5.5,
};

/** 各設備的外框大小與端子位置（未縮放） */
export function layoutOf(d: DeviceInstance): Layout {
  const p = d.params;
  switch (d.type) {
    case 'cvia92': {
      // 依使用者提供的主機圖：端子台在底部，端子位置對準圖上的圓點
      const ports: Record<string, PortPos> = {};
      HOST_IMG.ports.forEach(([id, tag], i) => {
        if (id) ports[id] = { x: HOST_IMG.portX[i], y: HOST_IMG.portY, side: 'bottom', tag };
      });
      return { w: HOST_IMG.w, h: HOST_IMG.h, ports };
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
    case 'gate': {
      // 依使用者提供的柵欄機圖：機箱在下、柵欄桿在機箱上方轉動
      const ports: Record<string, PortPos> = {};
      GATE_IMG.ports.forEach(([id, tag], i) => {
        if (id) ports[id] = { x: GATE_IMG.portX[i], y: GATE_IMG.portY, side: 'bottom', tag };
      });
      return { w: GATE_IMG.w, h: GATE_IMG.h, ports };
    }
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
