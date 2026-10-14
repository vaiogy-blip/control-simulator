import type { DeviceModel, PortDef, Rating } from './types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 帶有 ON/OFF 延遲的數位訊號 */
function delayed(state: { raw: boolean; out: boolean; t: number }, raw: boolean, onDelay: number, offDelay: number, dt: number) {
  if (raw !== state.raw) {
    state.raw = raw;
    state.t = 0;
  }
  if (state.out !== raw) {
    state.t += dt;
    if (state.t >= (raw ? onDelay : offDelay) - 1e-9) state.out = raw;
  }
  return state.out;
}

/** 額定電壓字串：'DC12'、'AC220'、'any'（不檢查） */
export function parseRating(r: string | undefined): Rating | null {
  const m = /^(DC|AC)(\d+(?:\.\d+)?)$/.exec(r ?? '');
  return m ? { kind: m[1] as 'DC' | 'AC', volts: Number(m[2]) } : null;
}
export const RATING_OPTIONS: [string, string][] = [
  ['any', '不限'],
  ['DC5', 'DC 5V'],
  ['DC12', 'DC 12V'],
  ['DC24', 'DC 24V'],
  ['AC24', 'AC 24V'],
  ['AC110', 'AC 110V'],
  ['AC220', 'AC 220V'],
];

// ---------- 輸入設備：一律有 COM、NO、NC 三個端子 ----------

const CONTACT_PORTS: PortDef[] = [
  { id: 'COM', label: 'COM' },
  { id: 'NO', label: 'NO' },
  { id: 'NC', label: 'NC' },
];
const contactOf = (on: boolean): [string, string][] => [on ? ['COM', 'NO'] : ['COM', 'NC']];

export const pushButton: DeviceModel<{ label: string }, { pressed: boolean }> = {
  type: 'pushButton',
  name: '押扣按鈕',
  category: '輸入設備',
  ports: () => CONTACT_PORTS,
  defaultParams: () => ({ label: '按鈕' }),
  init: () => ({ pressed: false }),
  contacts: (s) => contactOf(s.pressed),
  action(s, _p, a) {
    if (a === 'press') s.pressed = true;
    if (a === 'release') s.pressed = false;
  },
  points: (s) => [{ name: '接點', on: s.pressed, words: ['按下', '放開'] }],
};

export const toggleSwitch: DeviceModel<{ label: string }, { on: boolean }> = {
  type: 'toggleSwitch',
  name: '切換開關',
  category: '輸入設備',
  ports: () => CONTACT_PORTS,
  defaultParams: () => ({ label: '開關' }),
  init: () => ({ on: false }),
  contacts: (s) => contactOf(s.on),
  action(s, _p, a) {
    if (a === 'toggle') s.on = !s.on;
  },
  points: (s) => [{ name: '接點', on: s.on, words: ['ON', 'OFF'] }],
};

interface SensorParams {
  onDelay: number;
  offDelay: number;
  passTime: number;
}
interface SensorState {
  present: boolean;
  passT: number;
  d: { raw: boolean; out: boolean; t: number };
}
function sensor(type: string, name: string, words: [string, string]): DeviceModel<SensorParams, SensorState> {
  return {
    type,
    name,
    category: '輸入設備',
    ports: () => CONTACT_PORTS,
    defaultParams: () => ({ onDelay: 0.1, offDelay: 0.3, passTime: 2 }),
    init: () => ({ present: false, passT: 0, d: { raw: false, out: false, t: 0 } }),
    contacts: (s) => contactOf(s.d.out),
    step(s, p, ctx) {
      if (s.passT > 0) {
        s.passT -= ctx.dt;
        if (s.passT <= 0) s.present = false;
      }
      delayed(s.d, s.present, p.onDelay, p.offDelay, ctx.dt);
    },
    action(s, p, a) {
      if (a === 'toggle') {
        s.present = !s.present;
        s.passT = 0;
      }
      if (a === 'pass') {
        s.present = true;
        s.passT = p.passTime;
      }
    },
    points: (s) => [{ name: '接點', on: s.d.out, words }],
  };
}
export const loopDetector = sensor('loopDetector', '地感線圈', ['有車', '無車']);
export const irSensor = sensor('irSensor', '紅外線', ['遮斷', '恢復']);

export const cardReader: DeviceModel<{ hold: number }, { t: number }> = {
  type: 'cardReader',
  name: '卡機',
  category: '輸入設備',
  ports: () => CONTACT_PORTS,
  defaultParams: () => ({ hold: 0.4 }),
  init: () => ({ t: 0 }),
  contacts: (s) => contactOf(s.t > 0),
  step(s, _p, ctx) {
    s.t = Math.max(0, s.t - ctx.dt);
  },
  action(s, p, a) {
    if (a === 'swipe') s.t = p.hold;
  },
  points: (s) => [{ name: 'RELAY', on: s.t > 0, words: ['刷卡吸合', '釋放'] }],
};

// ---------- 遙控器（直立式，左側 ▲■▼F，右側 S；key 1~5） ----------

export const remote: DeviceModel<{ code: string; label: string }, { held: number[] }> = {
  type: 'remote',
  name: '遙控器',
  category: '遙控',
  ports: () => [],
  defaultParams: () => ({ code: Math.random().toString(16).slice(2, 10).toUpperCase(), label: '遙控器' }),
  init: () => ({ held: [] }),
  action(s, p, a, v) {
    const key = Number(v);
    if (a === 'keyDown' && !s.held.includes(key)) {
      s.held.push(key);
      return [{ code: p.code, key, down: true }];
    }
    if (a === 'keyUp' && s.held.includes(key)) {
      s.held = s.held.filter((k) => k !== key);
      return [{ code: p.code, key, down: false }];
    }
  },
};

// ---------- 電源 ----------

export const power: DeviceModel<{ kind: 'DC' | 'AC'; volts: number }, { on: boolean }> = {
  type: 'power',
  name: '電源',
  category: '電源',
  ports: (p) =>
    p.kind === 'DC'
      ? [
          { id: 'P', label: '+' },
          { id: 'N', label: '−' },
        ]
      : [
          { id: 'P', label: 'L' },
          { id: 'N', label: 'N' },
        ],
  defaultParams: () => ({ kind: 'DC', volts: 12 }),
  init: () => ({ on: true }),
  sources: (s, p) => [{ hot: 'P', cold: 'N', rating: { kind: p.kind, volts: p.volts }, on: s.on }],
  action(s, _p, a) {
    if (a === 'toggle') s.on = !s.on;
  },
  points: (s) => [{ name: '輸出', on: s.on, words: ['開', '關'] }],
};

// ---------- 輸出設備 ----------

interface GateParams {
  mode: 'direct' | 'pulse';
  openTime: number;
  closeTime: number;
  /** 畫面上的桿子長度（只影響外觀） */
  armLength: number;
}
interface GateState {
  pos: number;
  motion: 'idle' | 'up' | 'down';
  prev: Record<string, boolean>;
}
/** 柵欄機：上、停、下為乾接點輸入（與「共」接通即動作），另有上限、下限極限開關接點 */
export const gate: DeviceModel<GateParams, GateState> = {
  type: 'gate',
  name: '柵欄機',
  category: '輸出設備',
  ports: () => [
    { id: 'UP', label: '上' },
    { id: 'STOP', label: '停' },
    { id: 'DOWN', label: '下' },
    { id: 'COM', label: '共' },
    { id: 'LCOM', label: '限COM' },
    { id: 'OL', label: '上限' },
    { id: 'CL', label: '下限' },
  ],
  defaultParams: () => ({ mode: 'direct', openTime: 3, closeTime: 3, armLength: 170 }),
  init: () => ({ pos: 0, motion: 'idle', prev: {} }),
  senses: () => [
    { id: 'UP', a: 'UP', b: 'COM' },
    { id: 'STOP', a: 'STOP', b: 'COM' },
    { id: 'DOWN', a: 'DOWN', b: 'COM' },
  ],
  contacts(s) {
    const c: [string, string][] = [];
    if (s.pos >= 1 - 1e-6) c.push(['LCOM', 'OL']);
    if (s.pos <= 1e-6) c.push(['LCOM', 'CL']);
    return c;
  },
  step(s, p, { inputs: i, dt }) {
    if (p.mode === 'direct') {
      // 馬達直驅：上或下接通期間才會移動
      s.motion = i.UP && !i.DOWN ? 'up' : i.DOWN && !i.UP ? 'down' : 'idle';
    } else {
      // 柵欄機自帶控制板：上停下為脈衝觸發，自行跑到極限
      const rise = (k: string) => i[k] && !s.prev[k];
      if (rise('STOP')) s.motion = 'idle';
      else if (rise('UP')) s.motion = 'up';
      else if (rise('DOWN')) s.motion = 'down';
      s.prev = { ...i };
    }
    if (s.motion === 'up') s.pos = clamp01(s.pos + dt / Math.max(0.1, p.openTime));
    if (s.motion === 'down') s.pos = clamp01(s.pos - dt / Math.max(0.1, p.closeTime));
    if (p.mode === 'pulse' && ((s.motion === 'up' && s.pos >= 1) || (s.motion === 'down' && s.pos <= 0))) s.motion = 'idle';
  },
  points: (s, _p, i) => [
    { name: '上', on: !!i.UP, words: ['接通', '斷開'] },
    { name: '停', on: !!i.STOP, words: ['接通', '斷開'] },
    { name: '下', on: !!i.DOWN, words: ['接通', '斷開'] },
    { name: '上限', on: s.pos >= 1 - 1e-6, words: ['到位', '離開'] },
    { name: '下限', on: s.pos <= 1e-6, words: ['到位', '離開'] },
  ],
};

export const lamp: DeviceModel<{ color: string; label: string; rating: string }, { on: boolean }> = {
  type: 'lamp',
  name: '指示燈',
  category: '輸出設備',
  ports: () => [
    { id: 'P', label: '+' },
    { id: 'COM', label: 'COM' },
  ],
  defaultParams: () => ({ color: '#f5a623', label: '警示燈', rating: 'any' }),
  init: () => ({ on: false }),
  loads: (p) => [{ id: 'L', a: 'P', b: 'COM', rating: parseRating(p.rating) }],
  step(s, _p, ctx) {
    s.on = !!ctx.inputs.L;
  },
  points: (s) => [{ name: '燈', on: s.on, words: ['亮', '熄'] }],
};

export const trafficLight: DeviceModel<{ rating: string }, { r: boolean; g: boolean }> = {
  type: 'trafficLight',
  name: '紅綠燈',
  category: '輸出設備',
  ports: () => [
    { id: 'R', label: '紅' },
    { id: 'G', label: '綠' },
    { id: 'COM', label: 'COM' },
  ],
  defaultParams: () => ({ rating: 'any' }),
  init: () => ({ r: false, g: false }),
  loads: (p) => [
    { id: 'R', a: 'R', b: 'COM', rating: parseRating(p.rating) },
    { id: 'G', a: 'G', b: 'COM', rating: parseRating(p.rating) },
  ],
  step(s, _p, ctx) {
    s.r = !!ctx.inputs.R;
    s.g = !!ctx.inputs.G;
  },
  points: (s) => [
    { name: '紅燈', on: s.r, words: ['亮', '熄'] },
    { name: '綠燈', on: s.g, words: ['亮', '熄'] },
  ],
};

export const buzzer: DeviceModel<{ rating: string }, { on: boolean }> = {
  type: 'buzzer',
  name: '警報喇叭',
  category: '輸出設備',
  ports: () => [
    { id: 'P', label: '+' },
    { id: 'COM', label: 'COM' },
  ],
  defaultParams: () => ({ rating: 'any' }),
  init: () => ({ on: false }),
  loads: (p) => [{ id: 'L', a: 'P', b: 'COM', rating: parseRating(p.rating) }],
  step(s, _p, ctx) {
    s.on = !!ctx.inputs.L;
  },
  points: (s) => [{ name: '喇叭', on: s.on, words: ['鳴', '停'] }],
};

// ---------- 繼電器類 ----------

/**
 * 繼電器座端子（依 8 腳／14 腳繼電器座）：
 * 第 g 組接點：NC = g、NO = g+4、COM = g+8；線圈 13(−)、14(+)。
 * 2 組用 1、4 組（8 腳座：1 4 5 8 9 12 13 14），4 組用 1~4 組（14 腳座）。
 */
export function relayGroups(n: number): number[] {
  return ({ 1: [1], 2: [1, 4], 3: [1, 2, 3], 4: [1, 2, 3, 4] } as Record<number, number[]>)[n] ?? [1, 4];
}
function relayPorts(n: number): PortDef[] {
  const ports: PortDef[] = [];
  relayGroups(n).forEach((g, i) => {
    ports.push({ id: String(g + 8), label: `${g + 8}・COM${i + 1}` });
    ports.push({ id: String(g + 4), label: `${g + 4}・NO${i + 1}` });
    ports.push({ id: String(g), label: `${g}・NC${i + 1}` });
  });
  ports.push({ id: '14', label: '14・線圈+' }, { id: '13', label: '13・線圈−' });
  return ports;
}
function relayContacts(n: number, on: boolean): [string, string][] {
  return relayGroups(n).map((g) => [String(g + 8), String(on ? g + 4 : g)]);
}

export const relay: DeviceModel<{ groups: number; coil: string; onDelay: number; offDelay: number }, { d: { raw: boolean; out: boolean; t: number } }> = {
  type: 'relay',
  name: '繼電器',
  category: '繼電器類',
  ports: (p) => relayPorts(p.groups),
  defaultParams: () => ({ groups: 2, coil: 'DC12', onDelay: 0.02, offDelay: 0.02 }),
  init: () => ({ d: { raw: false, out: false, t: 0 } }),
  loads: (p) => [{ id: 'COIL', a: '14', b: '13', rating: parseRating(p.coil) }],
  contacts: (s, p) => relayContacts(p.groups, s.d.out),
  step(s, p, ctx) {
    delayed(s.d, !!ctx.inputs.COIL, p.onDelay, p.offDelay, ctx.dt);
  },
  points: (s) => [{ name: '線圈', on: s.d.out, words: ['吸合', '釋放'] }],
};

/** 計時繼電器（TDR）：線圈通電後依類型延時切換接點 */
export const timer: DeviceModel<
  { kind: 'TON' | 'TOF' | 'TP'; preset: number; groups: number; coil: string },
  { acc: number; out: boolean; prevIn: boolean; coil: boolean }
> = {
  type: 'timer',
  name: '計時繼電器',
  category: '繼電器類',
  ports: (p) => relayPorts(p.groups),
  defaultParams: () => ({ kind: 'TON', preset: 3, groups: 2, coil: 'DC12' }),
  init: () => ({ acc: 0, out: false, prevIn: false, coil: false }),
  loads: (p) => [{ id: 'COIL', a: '14', b: '13', rating: parseRating(p.coil) }],
  contacts: (s, p) => relayContacts(p.groups, s.out),
  step(s, p, ctx) {
    const inp = !!ctx.inputs.COIL;
    s.coil = inp;
    if (p.kind === 'TON') {
      s.acc = inp ? s.acc + ctx.dt : 0;
      s.out = inp && s.acc >= p.preset - 1e-9;
    } else if (p.kind === 'TOF') {
      s.acc = inp ? 0 : s.acc + ctx.dt;
      s.out = inp || (s.out && s.acc < p.preset - 1e-9);
    } else {
      if (inp && !s.prevIn && !s.out) {
        s.out = true;
        s.acc = 0;
      }
      if (s.out) {
        s.acc += ctx.dt;
        if (s.acc >= p.preset - 1e-9) s.out = false;
      }
    }
    s.prevIn = inp;
  },
  points: (s) => [
    { name: '線圈', on: s.coil, words: ['通電', '斷電'] },
    { name: '接點', on: s.out, words: ['切換', '復歸'] },
  ],
};

// ---------- 配線 ----------

/** 接線節點：分岔或轉接用的接點 */
export const node: DeviceModel<{}, {}> = {
  type: 'node',
  name: '節點',
  category: '配線',
  ports: () => [{ id: 'P', label: '節點' }],
  defaultParams: () => ({}),
  init: () => ({}),
};
