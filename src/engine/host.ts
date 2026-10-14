/**
 * 全功能主機（CVIA-92 全功能無線車道型遙控主機）
 *
 * 端子依《CVIA 按裝說明》接線圖：
 *   KEY 外部押扣：白＝上、紅＝停、黃＝下、綠＝共
 *   SENSOR：COM 共線、紅外線（防壓／防盜）、SM（分段定時／防盜／防煙）
 *   馬達控制：上（白）、停（紅）、下（黃）；切換開關「電」＝快速門／電子式馬達，「机」＝傳統門
 *   RELAY：NO／COM 乾接點（電鎖、電源開關、緊急求救／防盜／防煙警報輸出）
 *
 * 輸入都是乾接點：KEY 白／紅／黃 與綠（共）接通、紅外線／SM 與 SENSOR COM 接通即動作。
 * 輸出也是接點：馬達上停下與「共」之間、RELAY 的 NO 與 COM 之間由主機內部繼電器閉合。
 *
 * 依經銷商說明書重現主機行為。說明書寫得簡略的地方採用下列假設（標示「假設」），
 * 待使用者確認實機動作後再修正。
 */
import type { DeviceModel, PointDef, RfEvent, StepCtx } from './types';

export type Motion = 'idle' | 'up' | 'down';

export interface RemoteReg {
  serial: number;
  code: string;
  suspended: boolean;
}

export interface HostParams {
  /** 畫布上的外觀：diagram＝接線圖風格，photo＝實機外觀 */
  look: 'diagram' | 'photo';
  /** 主機板上的切換開關：electronic＝電（快速門／電子式馬達，上停下送脈衝），traditional＝机（傳統門，直接驅動馬達） */
  motorSwitch: 'electronic' | 'traditional';
  password: string;
  mode10: number;
  custom25: (string | null)[]; // 區碼 0~3，各 10 碼（▲1 ■2 ▼3 F4 S5 每鍵 2 碼）
  paused6: boolean;
  segTimer6: boolean;
  autoClose7: number;
  travel8: number;
  autoCut9: { sec: number; mode: number };
  o11: {
    learn12: boolean;
    needPwd: boolean;
    reversed: boolean;
    beep: boolean;
    hostType: 'shop' | 'lane';
    extBtn: boolean;
    extMode: '2A1B' | '3A';
    alarmRelaySync: boolean;
    smokeCycle: boolean;
    cutRelaySync: boolean;
    upRelaySync: boolean;
    irRelaySync: boolean;
    traffic: boolean;
    dirCtrl: boolean;
  };
  ir12: number[];
  m13: {
    protect: boolean;
    antiIdle: boolean;
    interlock: boolean;
    autoRestore: boolean;
    holdFollow: boolean;
    hold2sCut: boolean;
    rfSync: boolean;
  };
  hold14: number;
  relay15: number;
  sos16: number;
  guard17: number;
  warn17: number[];
  stage2_18: number;
  copy19: number;
  irAlarm23: number;
  alarm24: number;
  misc: Record<string, string>;
  remotes: RemoteReg[];
}

export const defaultHostParams = (): HostParams => ({
  look: 'diagram',
  motorSwitch: 'traditional',
  password: '1234',
  mode10: 1200,
  custom25: [null, null, null, null],
  paused6: false,
  segTimer6: false,
  autoClose7: 0,
  travel8: 0,
  autoCut9: { sec: 0, mode: 0 },
  o11: {
    learn12: true,
    needPwd: true,
    reversed: false,
    beep: true,
    hostType: 'lane',
    extBtn: false, // 出廠預設關閉（11#12），需用 11#11 或 11#22 開啟
    extMode: '2A1B',
    alarmRelaySync: true,
    smokeCycle: false,
    cutRelaySync: false,
    upRelaySync: false,
    irRelaySync: false,
    traffic: false,
    dirCtrl: false,
  },
  ir12: [],
  m13: {
    protect: false,
    antiIdle: false,
    interlock: false,
    autoRestore: false,
    holdFollow: false,
    hold2sCut: false,
    rfSync: false,
  },
  hold14: 1, // 假設：說明書未列預設值
  relay15: 1, // 假設：說明書未列預設值
  sos16: 0,
  guard17: 0,
  warn17: [],
  stage2_18: 0,
  copy19: 0,
  irAlarm23: 0,
  alarm24: 30,
  misc: {},
  remotes: [],
});

/** 25# 按鍵功能代碼 */
export const KEY_CODES: Record<string, string> = {
  '00': '不使用',
  '01': '上',
  '02': '下',
  '03': '停(復電)',
  '04': '上停下單鍵循環',
  '05': '上停循環',
  '06': '下停循環',
  '07': 'RELAY',
  '08': '斷電',
  '09': 'RELAY ON-OFF 單循',
  '10': '停共線-ON',
  '11': 'RELAY-ON',
  '12': '停共線-OFF',
  '13': 'RELAY-OFF',
  '14': '斷電-復電 單鍵循環',
  '15': '警報觸發',
};

/** 10# 控制器模式 → 遙控器 1、2、3、F 四鍵的功能代碼 */
export const MODE10: Record<number, { label: string; keys: string[]; unsure?: boolean }> = {
  1200: { label: '上停下斷', keys: ['01', '03', '02', '08'] },
  1201: { label: '上停下無', keys: ['01', '03', '02', '00'] },
  1202: { label: '1 上停下 2 停 F 斷', keys: ['04', '03', '00', '08'] },
  1203: { label: '3 上停下 2 停 F 斷', keys: ['00', '03', '04', '08'] },
  1204: { label: '1 上停下', keys: ['04', '00', '00', '00'] },
  1205: { label: '2 上停下', keys: ['00', '04', '00', '00'] },
  1206: { label: '3 上停下', keys: ['00', '00', '04', '00'] },
  1207: { label: '4 上停下', keys: ['00', '00', '00', '04'] },
  1208: { label: '1 上 2 停 3 下 F RELAY', keys: ['01', '03', '02', '07'] },
  1209: { label: '1 停共 ON 3 停共 OFF 2 RELAY ON 4 RELAY OFF', keys: ['10', '11', '12', '13'] },
  1210: { label: '1.2.3.F 停共線（NO/NC 可切換）', keys: ['10', '10', '10', '10'], unsure: true },
  1211: { label: '1 上停 3 下停', keys: ['05', '00', '06', '00'] },
  1212: { label: '2 上停 4 下停', keys: ['00', '05', '00', '06'] },
  1213: { label: '1 上 2 停 3 下 F RELAY ON-OFF', keys: ['01', '03', '02', '09'] },
  1214: { label: '1 上 3 下', keys: ['01', '00', '02', '00'] },
  1215: { label: '1.2.3.F 皆為上', keys: ['01', '01', '01', '01'] },
};

export type BeepKind = 'long' | 'long2' | '1' | '2' | '3' | '5';
export interface BeepLog {
  t: number;
  kind: BeepKind;
  msg: string;
}

interface KeypadSession {
  cmd: number;
  phase: 'waitRemote' | 'waitSerial';
  serial?: number;
}

export interface HostState {
  t: number;
  motion: Motion;
  driveT: number; // 目前方向繼電器剩餘通電秒數
  pos: number; // 主機依行程推算的門位置 0~1
  lastDir: 'up' | 'down' | null;
  protectT: number;
  pending: 'up' | 'down' | null;
  stopPulseT: number;
  stopLatch: boolean;
  cut: boolean;
  cutByManager: boolean;
  relayOn: boolean;
  relayPulseT: number;
  alarmT: number;
  autoCloseT: number | null;
  stage2T: number | null;
  carPassed: boolean;
  irResume: { dir: 'up' | 'down'; t: number | null } | null;
  holdOpen: boolean;
  outPulseT: number;
  /** 紅綠燈模式（11#27）一次上／下循環剩餘秒數；跑完前不延長、不反向 */
  trafficT: number;
  irBlockedT: number;
  irAlarmFired: boolean;
  warnPulseT: number;
  autoCutT: number | null;
  prev: Record<string, boolean>;
  held: Record<string, { keys: number[]; t0: number; sosFired: boolean }>;
  keypad: { buf: string; lastKeyT: number; session: KeypadSession | null };
  beeps: BeepLog[];
  beepSeq: number;
  logged: number;
  out: { UP: boolean; STOP: boolean; DOWN: boolean; RELAY: boolean };
  status: string;
}

const isMoving = (s: HostState) => s.motion !== 'idle';

function beep(s: HostState, kind: BeepKind, msg: string) {
  s.beeps.push({ t: s.t, kind, msg });
  s.beepSeq++;
  if (s.beeps.length > 100) s.beeps.shift();
}

export const BEEP_TEXT: Record<BeepKind, string> = {
  long: '嗶一長音',
  long2: '嗶一長音＋兩短音',
  '1': '嗶一聲',
  '2': '嗶兩聲',
  '3': '嗶三聲',
  '5': '嗶五聲',
};

/** 未用 25# 定義時的遙控器按鍵（使用者已確認）：▲上 ■停 ▼下 F 斷電 S 不使用 */

function areaOf(serial: number) {
  if (serial <= 1000) return 0;
  if (serial <= 2000) return 1;
  if (serial <= 2950) return 2;
  return -1;
}

export const DEFAULT_KEYS = ['01', '03', '02', '08', '00'];

const splitCodes = (c: string) => [0, 2, 4, 6, 8].map((i) => c.slice(i, i + 2) || '00');

/** 遙控器五鍵的功能代碼，只由 25# 定義（10# 已不使用） */
export function keyMap(p: HostParams, area: number): string[] {
  const custom = area >= 0 ? p.custom25[area] : null;
  return custom ? splitCodes(custom) : DEFAULT_KEYS;
}

/** 外部押扣依 25# 區碼 3 的順序「白 1 黃 2 紅 3」；預設依接線圖白＝上、黃＝下、紅＝停 */
function extMap(p: HostParams): string[] {
  const c = p.custom25[3];
  if (c) return splitCodes(c).slice(0, 3);
  return ['01', '02', '03'];
}

// ---------- 動作 ----------

function startMove(s: HostState, p: HostParams, dir: 'up' | 'down') {
  if (s.cut) return;
  // 紅綠燈模式：上／下繼電器吸合 14# 秒數跑完一次完整循環，期間同向不延長、反向不改變，跑完才復歸
  if (p.o11.traffic) {
    if (s.trafficT > 0) return;
    s.motion = dir;
    s.lastDir = dir;
    s.irResume = null;
    s.pending = null;
    s.trafficT = s.driveT = s.outPulseT = Math.max(0.1, p.hold14);
    s.autoCloseT = null;
    s.stage2T = null;
    return;
  }
  if (p.m13.protect && isMoving(s) && s.motion !== dir) {
    s.motion = 'idle';
    s.driveT = 0;
    s.pending = dir;
    s.protectT = 2;
    return;
  }
  if (s.protectT > 0) {
    s.pending = dir;
    return;
  }
  s.motion = dir;
  s.lastDir = dir;
  s.irResume = null;
  // driveT＝主機認定門還在移動的時間；outPulseT＝方向繼電器實際吸合的時間
  // 机（傳統門）：繼電器通電完整 8# 行程時間（假設），8# 為 0 時一直通電到按停或反向
  // 電（快速門）：繼電器只吸合 14# 秒數送出脈衝，門由快速門控制板自行跑完；8# 用來推算何時到位
  if (p.motorSwitch === 'electronic') {
    s.outPulseT = p.hold14;
    s.driveT = p.travel8 > 0 ? p.travel8 : p.hold14;
  } else {
    s.driveT = p.travel8 > 0 ? p.travel8 : Infinity;
    s.outPulseT = s.driveT;
  }
  if (dir === 'down') {
    s.autoCloseT = null;
    s.stage2T = null;
  }
  if (p.autoCut9.sec > 0) {
    const m = p.autoCut9.mode;
    if (m === 3 || (m === 1 && dir === 'up') || (m === 2 && dir === 'down')) s.autoCutT = p.autoCut9.sec;
  }
  if (p.warn17.includes(15)) s.warnPulseT = p.relay15;
}

function up(s: HostState, p: HostParams, fromRemote = false) {
  if (s.cut) return;
  startMove(s, p, 'up');
  if (fromRemote && p.o11.upRelaySync) s.relayPulseT = p.relay15;
  if (p.ir12.includes(6)) {
    s.stage2T = null;
    s.carPassed = false;
  }
}

function irBlocksDown(s: HostState, p: HostParams) {
  return !!s.prev.IR && p.ir12.some((m) => [1, 2, 3, 4].includes(m));
}

function down(s: HostState, p: HostParams) {
  if (s.cut) return;
  // 假設：紅外線啟用且被遮斷時，不接受下降命令
  if (irBlocksDown(s, p)) {
    beep(s, '3', '紅外線遮斷中，拒絕下降');
    return;
  }
  startMove(s, p, 'down');
}

function stop(s: HostState, p: HostParams, opts: { restore?: boolean; manager?: boolean } = {}) {
  // 紅綠燈循環中不接受停，一定跑完整個 14# 秒數
  if (p.o11.traffic && s.trafficT > 0) return;
  s.motion = 'idle';
  s.driveT = 0;
  s.pending = null;
  s.protectT = 0;
  s.irResume = null;
  s.autoCutT = null;
  s.stopPulseT = p.hold14;
  if (p.warn17.includes(15)) s.warnPulseT = p.relay15;
  if (opts.restore !== false && s.cut && (!s.cutByManager || opts.manager)) {
    s.cut = false;
    s.cutByManager = false;
  }
  // 停 也解除長鳴警報
  if (s.alarmT > 0) s.alarmT = 0;
  if (p.ir12.includes(6) && s.pos > 0 && p.autoClose7 > 0) {
    s.autoCloseT = p.autoClose7;
    s.stage2T = null;
  }
}

function cutPower(s: HostState, p: HostParams, manager = false) {
  s.motion = 'idle';
  s.driveT = 0;
  s.pending = null;
  s.cut = true;
  s.cutByManager = manager;
  s.trafficT = 0;
  s.outPulseT = 0;
  s.autoCloseT = null;
  s.stage2T = null;
  if (p.o11.cutRelaySync) s.relayPulseT = p.relay15;
}

function triggerAlarm(s: HostState, p: HostParams, why: string) {
  s.alarmT = p.alarm24 >= 255 ? Infinity : p.alarm24;
  beep(s, '1', `警報觸發：${why}`);
}

export function execCode(s: HostState, p: HostParams, code: string, src: 'remote' | 'ext' | 'manager' = 'remote') {
  const fromRemote = src !== 'ext';
  switch (code) {
    case '01':
      return up(s, p, fromRemote);
    case '02':
      return down(s, p);
    case '03':
      return stop(s, p, { manager: src === 'manager' });
    case '04':
      if (isMoving(s) || s.protectT > 0) return stop(s, p, { restore: false });
      return s.lastDir === 'up' ? down(s, p) : up(s, p, fromRemote);
    case '05':
      return isMoving(s) ? stop(s, p, { restore: false }) : up(s, p, fromRemote);
    case '06':
      return isMoving(s) ? stop(s, p, { restore: false }) : down(s, p);
    case '07':
      s.relayPulseT = p.relay15;
      return;
    case '08':
      return cutPower(s, p, src === 'manager');
    case '09':
      s.relayOn = !s.relayOn;
      return;
    case '10':
      s.stopLatch = true;
      return;
    case '11':
      s.relayOn = true;
      return;
    case '12':
      s.stopLatch = false;
      return;
    case '13':
      s.relayOn = false;
      return;
    case '14':
      if (s.cut) stop(s, p);
      else cutPower(s, p);
      return;
    case '15':
      return triggerAlarm(s, p, '按鍵');
  }
}

// ---------- 遙控器 ----------

function handleRf(s: HostState, p: HostParams, ev: RfEvent) {
  const held = (s.held[ev.code] ??= { keys: [], t0: s.t, sosFired: false });
  if (!ev.down) {
    held.keys = held.keys.filter((k) => k !== ev.key);
    return;
  }
  if (!held.keys.includes(ev.key)) held.keys.push(ev.key);
  held.t0 = s.t;
  held.sosFired = false;

  const kp = s.keypad.session;
  if (kp && kp.cmd === 1 && kp.phase === 'waitRemote') {
    if (p.remotes.some((r) => r.code === ev.code)) {
      beep(s, '3', '此遙控器已登錄');
    } else {
      p.remotes.push({ serial: kp.serial!, code: ev.code, suspended: false });
      beep(s, '1', `新增遙控器，序號 ${kp.serial}`);
    }
    kp.phase = 'waitSerial';
    s.keypad.lastKeyT = s.t;
    return;
  }

  const reg = p.remotes.find((r) => r.code === ev.code);
  if (!reg) return; // 未登錄的遙控器不反應
  if (reg.suspended) return;
  if (reg.serial >= 2951 && reg.serial <= 2999) {
    // 管理型遙控器：上停下斷電，可解除一般機無法復電的斷電
    const code = ['01', '03', '02', '08', '00'][ev.key - 1];
    if (code) execCode(s, p, code, 'manager');
    return;
  }
  if (p.paused6) return;
  const code = keyMap(p, areaOf(reg.serial))[ev.key - 1];
  if (code && code !== '00') execCode(s, p, code, 'remote');
}

// ---------- 鍵盤設定 ----------

const KEYPAD_TIMEOUT = 8;

function setFlag11(p: HostParams, v: number): boolean {
  const o = p.o11;
  const map: Record<number, () => void> = {
    0: () => (o.learn12 = false),
    1: () => (o.learn12 = true),
    2: () => (o.needPwd = true),
    3: () => (o.needPwd = false),
    4: () => (o.reversed = true),
    5: () => (o.reversed = false),
    6: () => (o.beep = true),
    7: () => (o.beep = false),
    8: () => (o.hostType = 'shop'),
    9: () => (o.hostType = 'lane'),
    10: () => {},
    11: () => (o.extBtn = true),
    12: () => (o.extBtn = false),
    13: () => {},
    14: () => {},
    15: () => (o.alarmRelaySync = true),
    16: () => (o.alarmRelaySync = false),
    17: () => (o.smokeCycle = true),
    18: () => (o.smokeCycle = false),
    19: () => (o.cutRelaySync = true),
    20: () => (o.cutRelaySync = false),
    21: () => {
      o.extBtn = true;
      o.extMode = '3A';
    },
    22: () => {
      o.extBtn = true;
      o.extMode = '2A1B';
    },
    23: () => (o.upRelaySync = true),
    24: () => (o.upRelaySync = false),
    25: () => (o.irRelaySync = true),
    26: () => (o.irRelaySync = false),
    27: () => (o.traffic = true),
    28: () => (o.traffic = false),
    29: () => (o.dirCtrl = true),
    30: () => (o.dirCtrl = false),
  };
  if (!map[v]) return false;
  map[v]();
  return true;
}

function setFlag13(p: HostParams, v: number): boolean {
  const m = p.m13;
  const map: Record<number, () => void> = {
    0: () => (m.protect = false),
    1: () => (m.protect = true),
    2: () => (m.antiIdle = true),
    3: () => (m.antiIdle = false),
    4: () => (m.interlock = true),
    5: () => (m.interlock = false),
    6: () => (m.autoRestore = true),
    7: () => (m.autoRestore = false),
    8: () => (m.holdFollow = true),
    9: () => (m.holdFollow = false),
    10: () => (m.hold2sCut = true),
    11: () => (m.hold2sCut = false),
    12: () => (m.rfSync = true),
    13: () => (m.rfSync = false),
  };
  if (!map[v]) return false;
  map[v]();
  return true;
}

const num = (x: string | undefined) => (x !== undefined && /^\d+$/.test(x) ? Number(x) : NaN);
const inRange = (v: number, lo: number, hi: number) => !Number.isNaN(v) && v >= lo && v <= hi;

function restoreDefaults(p: HostParams, kind: number) {
  const d = defaultHostParams();
  const keep = { remotes: p.remotes, password: p.password };
  Object.assign(p, d, keep);
  if (kind === 1) p.o11.hostType = 'shop';
  if (kind === 2) p.guard17 = 3;
}

/** 解析一筆以「米」結尾的鍵盤指令 */
function runCommand(s: HostState, p: HostParams, buf: string) {
  const kp = s.keypad;
  const sess = kp.session;

  // 連續輸入模式
  if (sess) {
    if (buf === '') {
      kp.session = null;
      beep(s, '1', '結束設定');
      return;
    }
    const serial = num(buf);
    if (sess.cmd === 1) {
      if (!inRange(serial, 0, 3020) || p.remotes.some((r) => r.serial === serial)) {
        beep(s, '3', '序號重覆或格式錯誤');
        return;
      }
      sess.serial = serial;
      sess.phase = 'waitRemote';
      beep(s, 'long', `請按遙控器任一鍵（序號 ${serial}）`);
      return;
    }
    applySerialCmd(s, p, sess.cmd, serial);
    return;
  }

  // 簡化格式：功能#設定值米（不輸入密碼），例如 11#11米
  const parts = buf.split('#');
  const cmd = num(parts[0]);
  if (Number.isNaN(cmd) || parts.length < 2) {
    beep(s, '3', '格式錯誤');
    return;
  }
  const a = parts[1];
  const v = num(a);
  const ok = (msg: string) => beep(s, 'long', msg);
  const bad = (msg = '設定值錯誤') => beep(s, '3', msg);

  switch (cmd) {
    case 1:
      if (!inRange(v, 0, 3020) || p.remotes.some((r) => r.serial === v)) return bad('序號重覆或格式錯誤');
      kp.session = { cmd: 1, phase: 'waitRemote', serial: v };
      return ok(`請按遙控器任一鍵（序號 ${v}）`);
    case 2:
    case 3:
    case 4:
      kp.session = { cmd, phase: 'waitSerial' };
      return applySerialCmd(s, p, cmd, v);
    case 5:
      return bad('設定已不需密碼，5# 不使用');
    case 6:
      if (v === 0) p.paused6 = false;
      else if (v === 1) p.paused6 = true;
      else if (v === 2) p.segTimer6 = true;
      else if (v === 3) p.segTimer6 = false;
      else return bad();
      return ok(`6# 設為 ${v}`);
    case 7:
      if (!inRange(v, 0, 500)) return bad();
      p.autoClose7 = v;
      return ok(v ? `自動下降 ${v} 秒` : '關閉自動下降');
    case 8:
      if (!inRange(v, 0, 120)) return bad();
      p.travel8 = v;
      return ok(v ? `行程時間 ${v} 秒` : '關閉行程');
    case 9: {
      const m = num(parts[2]);
      if (!inRange(v, 0, 500) || (v > 0 && !inRange(m, 0, 3))) return bad();
      p.autoCut9 = { sec: v, mode: v ? m : 0 };
      return ok(v ? `自動斷電 ${v} 秒，模式 ${m}` : '關閉自動斷電');
    }
    case 10:
      return bad('10# 已不使用，請用 25# 定義按鍵');
    case 11:
      return setFlag11(p, v) ? ok(`11# 設定 ${v}`) : bad();
    case 12:
      if (!inRange(v, 0, 7)) return bad();
      if (v === 0) p.ir12 = [];
      else if (!p.ir12.includes(v)) p.ir12 = [...p.ir12, v].sort();
      return ok(v ? `紅外線功能 ${v}` : '關閉紅外線');
    case 13:
      return setFlag13(p, v) ? ok(`13# 設定 ${v}`) : bad();
    case 14:
      if (!inRange(v, 0, 255)) return bad();
      p.hold14 = v;
      return ok(`上停下吸持 ${v} 秒`);
    case 15:
      if (!inRange(v, 0, 255)) return bad();
      p.relay15 = v;
      return ok(`第四繼電器吸持 ${v} 秒`);
    case 16:
      if (!inRange(v, 0, 255)) return bad();
      p.sos16 = v;
      return ok(v ? `緊急求救 ${v} 秒` : '關閉緊急求救');
    case 17:
      if (v === 0) {
        p.guard17 = 0;
        return ok('關閉防盜');
      }
      if (inRange(v, 1, 3)) {
        p.guard17 = v;
        return ok(`防盜模式 ${v}`);
      }
      if (v === 10) {
        p.warn17 = [];
        return ok('關閉警示燈');
      }
      if (inRange(v, 11, 15)) {
        if (!p.warn17.includes(v)) p.warn17 = [...p.warn17, v].sort();
        return ok(`警示燈模式 ${v}`);
      }
      return bad();
    case 18:
      if (!inRange(v, 0, 255)) return bad();
      p.stage2_18 = v;
      return ok(`二段式關門 ${v} 秒`);
    case 19:
      if (!inRange(v, 0, 1)) return bad();
      p.copy19 = v;
      return ok(`盜拷設定 ${v}`);
    case 20:
      if (!inRange(v, 0, 2)) return bad();
      restoreDefaults(p, v);
      return ok('還原預設值');
    case 21:
      if (a !== '4148') return bad();
      p.remotes = [];
      return ok('已刪除所有遙控器');
    case 23:
      if (!inRange(v, 0, 255)) return bad();
      p.irAlarm23 = v;
      return ok(v ? `紅外線關門警報 ${v} 秒` : '關閉紅外線關門警報');
    case 24:
      if (!inRange(v, 1, 255)) return bad();
      p.alarm24 = v;
      return ok(v === 255 ? '警報長鳴' : `警報 ${v} 秒`);
    case 25: {
      let code = parts[2];
      if (code && /^\d{8}$/.test(code)) code += '00'; // 舊四鍵格式，S 鍵不使用
      if (!inRange(v, 0, 3) || !code || !/^\d{10}$/.test(code)) return bad('需輸入 10 碼（▲■▼FS 各 2 碼）');
      const keys = splitCodes(code);
      if (keys.some((k) => !KEY_CODES[k])) return bad('按鍵代碼錯誤');
      p.custom25 = p.custom25.map((c, i) => (i === v ? code : c));
      return ok(`自訂按鍵 區碼 ${v} = ${code}`);
    }
    case 22:
    case 26:
    case 27:
    case 28:
    case 29:
    case 30:
    case 31:
      p.misc[String(cmd)] = parts.slice(1).join('#');
      return ok(`${cmd}# 已記錄（模擬器尚未模擬此功能）`);
    default:
      return bad('無此功能');
  }
}

function applySerialCmd(s: HostState, p: HostParams, cmd: number, serial: number) {
  const idx = p.remotes.findIndex((r) => r.serial === serial);
  if (idx < 0) {
    beep(s, '3', `無此序號 ${Number.isNaN(serial) ? '' : serial}`);
    return;
  }
  if (cmd === 2) p.remotes.splice(idx, 1);
  if (cmd === 3) p.remotes[idx].suspended = true;
  if (cmd === 4) p.remotes[idx].suspended = false;
  beep(s, '1', `${{ 2: '刪除', 3: '暫刪', 4: '恢復' }[cmd]}序號 ${serial}`);
}

export function pressKey(s: HostState, p: HostParams, key: string) {
  const kp = s.keypad;
  kp.lastKeyT = s.t;
  if (key === '*') {
    const buf = kp.buf;
    kp.buf = '';
    runCommand(s, p, buf);
  } else {
    kp.buf += key;
  }
}

// ---------- 掃描週期 ----------

function edge(s: HostState, i: Record<string, boolean>, k: string, nc = false) {
  const now = !!i[k];
  const was = !!s.prev[k];
  return nc ? was && !now : now && !was;
}

function hostStep(s: HostState, p: HostParams, ctx: StepCtx): void {
  const { dt, inputs: i } = ctx;
  s.t = ctx.t;

  // 鍵盤逾時
  const kp = s.keypad;
  if ((kp.buf || kp.session) && s.t - kp.lastKeyT > KEYPAD_TIMEOUT) {
    kp.buf = '';
    kp.session = null;
    beep(s, '5', '超過 8 秒未操作，離開設定');
  }

  // 遙控器
  for (const ev of ctx.rf) handleRf(s, p, ev);
  if (p.sos16 > 0) {
    for (const h of Object.values(s.held)) {
      if (h.keys.includes(4) && !h.sosFired && s.t - h.t0 >= p.sos16) {
        h.sosFired = true;
        triggerAlarm(s, p, '緊急求救');
      }
    }
  }

  // KEY 外部押扣（卡機的 RELAY 也接在 KEY 的「上」）
  if (p.o11.extBtn && !p.paused6) {
    const codes = extMap(p);
    const ports = ['KEY_W', 'KEY_Y', 'KEY_R'];
    ports.forEach((port, idx) => {
      // 2A1B：白、黃為常開，紅（停）為常閉
      const nc = p.o11.extMode === '2A1B' && port === 'KEY_R';
      if (edge(s, i, port, nc)) {
        beep(s, '1', `外部接點動作（KEY ${{ KEY_W: '白', KEY_Y: '黃', KEY_R: '紅' }[port]}）`);
        if (codes[idx] !== '00') execCode(s, p, codes[idx], 'ext');
      }
    });
  }

  // SENSOR SM：分段定時／防盜／防煙
  const smRise = edge(s, i, 'SM');
  const smFall = edge(s, i, 'SM', true);
  if (p.o11.smokeCycle) {
    if (smRise) execCode(s, p, '04', 'ext');
  } else if (s.cut && (p.guard17 === 2 || p.guard17 === 3)) {
    if (smRise) triggerAlarm(s, p, '防盜（SM 接點）');
  } else if (p.segTimer6) {
    // 分段定時：SM 觸發時嗶一長兩短並開門保持；解除時嗶一長音，再依 7# 秒數倒數後關門
    if (smRise) {
      beep(s, 'long2', '分段定時觸發，保持開門');
      s.holdOpen = true;
      s.autoCloseT = null;
      s.stage2T = null;
      up(s, p, false);
    }
    if (smFall) {
      beep(s, 'long', '分段定時解除');
      s.holdOpen = false;
      if (p.autoClose7 > 0) s.autoCloseT = p.autoClose7;
      else down(s, p);
    }
  }

  // 紅外線
  const ir = !!i.IR;
  const irRise = edge(s, i, 'IR');
  const irFall = edge(s, i, 'IR', true);
  if (irRise) beep(s, '1', '紅外線接點動作');
  if (s.cut && (p.guard17 === 1 || p.guard17 === 3) && irRise) triggerAlarm(s, p, '防盜（紅外線）');
  if (ir) {
    s.irBlockedT += dt;
    if (p.irAlarm23 > 0 && !s.irAlarmFired && s.irBlockedT >= p.irAlarm23) {
      s.irAlarmFired = true;
      triggerAlarm(s, p, '紅外線持續遮斷');
    }
  } else {
    s.irBlockedT = 0;
    s.irAlarmFired = false;
  }
  const irm = p.ir12;
  // 紅綠燈循環中紅外線也不改變動作
  if (ir && isMoving(s) && !(p.o11.traffic && s.trafficT > 0)) {
    if (s.motion === 'down') {
      if (irm.includes(7)) {
        s.motion = 'idle';
        s.driveT = 0;
        s.stopPulseT = p.hold14;
        s.irResume = { dir: 'down', t: null };
      } else if (irm.includes(2) || irm.includes(3)) {
        s.motion = 'idle';
        s.driveT = 0;
        startMove(s, p, 'up');
        beep(s, '1', '紅外線遮斷，停止並彈升');
      } else if (irm.includes(1) || irm.includes(4)) {
        stop(s, p, { restore: false });
      }
    } else if (s.motion === 'up') {
      if (irm.includes(7)) {
        s.motion = 'idle';
        s.driveT = 0;
        s.stopPulseT = p.hold14;
        s.irResume = { dir: 'up', t: null };
      } else if (irm.includes(4)) {
        stop(s, p, { restore: false });
      }
    }
  }
  if (s.irResume) {
    if (ir) s.irResume.t = null;
    else if (s.irResume.t === null) s.irResume.t = p.stage2_18;
    else {
      s.irResume.t -= dt;
      if (s.irResume.t <= 0) {
        const dir = s.irResume.dir;
        s.irResume = null;
        startMove(s, p, dir);
      }
    }
  }
  // 二段式關門：車輛離開感應區後依 18# 秒數關門
  if (irm.includes(3) && irFall && s.lastDir === 'up' && !s.cut && !s.holdOpen) {
    s.carPassed = true;
    if (p.stage2_18 > 0) {
      s.stage2T = p.stage2_18;
      s.autoCloseT = null;
    }
  }

  // 方向繼電器計時
  if (s.protectT > 0) {
    s.protectT -= dt;
    if (s.protectT <= 0) {
      s.protectT = 0;
      const d = s.pending;
      s.pending = null;
      if (d) startMove(s, p, d);
    }
  }
  if (isMoving(s)) {
    if (p.travel8 > 0) {
      const dp = dt / p.travel8;
      s.pos = Math.max(0, Math.min(1, s.pos + (s.motion === 'up' ? dp : -dp)));
    }
    s.driveT -= dt;
    if (s.driveT <= 1e-9) {
      const dir = s.motion;
      s.motion = 'idle';
      s.driveT = 0;
      s.pos = dir === 'up' ? 1 : 0;
      if (dir === 'up' && !p.o11.traffic && p.autoClose7 > 0 && s.stage2T === null && !s.holdOpen) s.autoCloseT = p.autoClose7;
      if (dir === 'down') {
        s.autoCloseT = null;
        s.stage2T = null;
        s.carPassed = false;
      }
    }
  }

  // 紅綠燈循環倒數：剩 5 秒起每秒嗶一聲
  if (s.trafficT > 0) {
    const before = s.trafficT;
    s.trafficT = Math.max(0, s.trafficT - dt);
    for (let n = 5; n >= 1; n--) if (before >= n - 1e-9 && s.trafficT < n - 1e-9) beep(s, '1', `紅綠燈倒數 ${n}`);
  }

  // 自動下降、二段式關門倒數（紅外線遮斷時暫停並重新計時）
  const blocked = ir && irm.length > 0;
  if (s.autoCloseT !== null) {
    if (blocked) s.autoCloseT = p.autoClose7;
    else {
      const before = s.autoCloseT;
      s.autoCloseT -= dt;
      // 倒數剩 5 秒起每秒嗶一短音，嗶完第 5 聲才送下
      for (let n = 5; n >= 1; n--) if (before >= n - 1e-9 && s.autoCloseT < n - 1e-9) beep(s, '1', `自動關門倒數 ${n}`);
      if (s.autoCloseT <= 1e-9) {
        s.autoCloseT = null;
        down(s, p);
      }
    }
  }
  if (s.stage2T !== null) {
    if (blocked) s.stage2T = p.stage2_18;
    else {
      s.stage2T -= dt;
      if (s.stage2T <= 0) {
        s.stage2T = null;
        down(s, p);
      }
    }
  }

  // 自動斷電
  if (s.autoCutT !== null) {
    s.autoCutT -= dt;
    if (s.autoCutT <= 0) {
      s.autoCutT = null;
      cutPower(s, p);
    }
  }

  // 計時遞減
  const dec = (v: number) => Math.max(0, v - dt);
  const stopOut = s.stopPulseT > 0 || s.stopLatch;
  s.stopPulseT = dec(s.stopPulseT);
  const relayPulse = s.relayPulseT > 0;
  s.relayPulseT = dec(s.relayPulseT);
  const alarm = s.alarmT > 0;
  if (s.alarmT !== Infinity) s.alarmT = dec(s.alarmT);
  const warnPulse = s.warnPulseT > 0;
  s.warnPulseT = dec(s.warnPulseT);
  const dirOut = s.outPulseT > 0;
  s.outPulseT = dec(s.outPulseT);

  // 輸出
  let upOut = s.motion === 'up' && dirOut;
  let downOut = s.motion === 'down' && dirOut;
  if (p.o11.reversed) [upOut, downOut] = [downOut, upOut];

  const w = p.warn17;
  const warn =
    (w.includes(11) && s.motion === 'up') ||
    (w.includes(12) && s.motion === 'down') ||
    (w.includes(13) && (s.pos > 0 || s.motion === 'up')) ||
    (w.includes(14) && s.autoCloseT !== null && s.autoCloseT <= p.relay15) ||
    (w.includes(15) && warnPulse);

  const fullyOpen = s.motion === 'idle' && s.pos >= 1 && !s.cut;
  // 接線圖上只有一組 RELAY（NO／COM），警報、警示燈、紅綠燈都由它輸出（假設）
  const relayOut =
    s.relayOn ||
    relayPulse ||
    (p.o11.alarmRelaySync && alarm) ||
    (p.o11.irRelaySync && ir) ||
    warn ||
    (p.o11.traffic && fullyOpen);

  s.status = s.cut
    ? '斷電'
    : s.protectT > 0
      ? '馬達保護等待'
      : s.motion === 'up'
        ? '上升中'
        : s.motion === 'down'
          ? '下降中'
          : s.irResume
            ? '紅外線暫停'
            : s.pos >= 1
              ? '全開'
              : s.pos <= 0
                ? '全關'
                : '停止';

  s.prev = { ...i };
  s.out = { UP: upOut, STOP: stopOut, DOWN: downOut, RELAY: relayOut };
}

export const initHostState = (): HostState => ({
  t: 0,
  motion: 'idle',
  driveT: 0,
  pos: 0,
  lastDir: null,
  protectT: 0,
  pending: null,
  stopPulseT: 0,
  stopLatch: false,
  cut: false,
  cutByManager: false,
  relayOn: false,
  relayPulseT: 0,
  alarmT: 0,
  autoCloseT: null,
  stage2T: null,
  carPassed: false,
  irResume: null,
  holdOpen: false,
  outPulseT: 0,
  trafficT: 0,
  irBlockedT: 0,
  irAlarmFired: false,
  warnPulseT: 0,
  autoCutT: null,
  prev: {},
  held: {},
  keypad: { buf: '', lastKeyT: 0, session: null },
  beeps: [],
  beepSeq: 0,
  logged: 0,
  out: { UP: false, STOP: false, DOWN: false, RELAY: false },
  status: '全關',
});

/** 主機目前的設定，以實機指令列出（接線圖上的參數清單） */
export function paramSummary(p: HostParams): string[] {
  const d = defaultHostParams();
  const out: string[] = [];
  if (p.paused6) out.push('6#1*');
  if (p.segTimer6) out.push('6#2*');
  if (p.autoClose7 !== d.autoClose7) out.push(`7#${p.autoClose7}*`);
  if (p.travel8 !== d.travel8) out.push(`8#${p.travel8}*`);
  if (p.autoCut9.sec) out.push(`9#${p.autoCut9.sec}#${p.autoCut9.mode}*`);
  const o = p.o11;
  if (o.extBtn) out.push(o.extMode === '3A' ? '11#21*' : '11#22*');
  // [目前值, 預設值, 開啟代碼, 關閉代碼]
  const flags: [boolean, boolean, number, number][] = [
    [o.reversed, d.o11.reversed, 4, 5],
    [o.beep, d.o11.beep, 6, 7],
    [o.alarmRelaySync, d.o11.alarmRelaySync, 15, 16],
    [o.smokeCycle, d.o11.smokeCycle, 17, 18],
    [o.cutRelaySync, d.o11.cutRelaySync, 19, 20],
    [o.upRelaySync, d.o11.upRelaySync, 23, 24],
    [o.irRelaySync, d.o11.irRelaySync, 25, 26],
    [o.traffic, d.o11.traffic, 27, 28],
  ];
  for (const [v, def, on, off] of flags) if (v !== def) out.push(`11#${v ? on : off}*`);
  for (const m of p.ir12) out.push(`12#${m}*`);
  if (p.m13.protect) out.push('13#1*');
  if (p.hold14 !== d.hold14) out.push(`14#${p.hold14}*`);
  if (p.relay15 !== d.relay15) out.push(`15#${p.relay15}*`);
  if (p.sos16) out.push(`16#${p.sos16}*`);
  if (p.guard17) out.push(`17#${p.guard17}*`);
  for (const m of p.warn17) out.push(`17#${m}*`);
  if (p.stage2_18) out.push(`18#${p.stage2_18}*`);
  if (p.irAlarm23) out.push(`23#${p.irAlarm23}*`);
  if (p.alarm24 !== d.alarm24) out.push(`24#${p.alarm24}*`);
  p.custom25.forEach((c, i) => c && out.push(`25#${i}#${c}*`));
  return out;
}

export const cvia92: DeviceModel<HostParams, HostState> = {
  type: 'cvia92',
  name: '全功能主機',
  category: '控制主機',
  ports: () => [
    { id: 'KEY_W', label: '白(上)' },
    { id: 'KEY_R', label: '紅(停)' },
    { id: 'KEY_Y', label: '黃(下)' },
    { id: 'KEY_G', label: '綠(共)' },
    { id: 'SCOM', label: 'SENSOR COM' },
    { id: 'IR', label: '紅外線' },
    { id: 'SM', label: 'SM' },
    { id: 'UPNC', label: '上 NC' },
    { id: 'UP', label: '上 NO' },
    { id: 'STOP', label: '停 NO' },
    { id: 'DOWNNC', label: '下 NC' },
    { id: 'DOWN', label: '下 NO' },
    { id: 'MCOM', label: '共 G' },
    { id: 'RNC', label: 'RELAY4 NC' },
    { id: 'RCOM', label: 'RELAY4 G' },
    { id: 'RNO', label: 'RELAY4 NO' },
  ],
  defaultParams: defaultHostParams,
  init: initHostState,
  senses: () => [
    { id: 'KEY_W', a: 'KEY_W', b: 'KEY_G' },
    { id: 'KEY_R', a: 'KEY_R', b: 'KEY_G' },
    { id: 'KEY_Y', a: 'KEY_Y', b: 'KEY_G' },
    { id: 'IR', a: 'IR', b: 'SCOM' },
    { id: 'SM', a: 'SM', b: 'SCOM' },
  ],
  contacts(s) {
    const c: [string, string][] = [];
    // 上、下、RELAY4 是獨立的繼電器：沒動作時 NC 與共點接通，動作時改成 NO 接通
    c.push(s.out.UP ? ['MCOM', 'UP'] : ['MCOM', 'UPNC']);
    if (s.out.STOP) c.push(['MCOM', 'STOP']);
    c.push(s.out.DOWN ? ['MCOM', 'DOWN'] : ['MCOM', 'DOWNNC']);
    c.push(s.out.RELAY ? ['RCOM', 'RNO'] : ['RCOM', 'RNC']);
    return c;
  },
  step: hostStep,
  action(s, p, a, v) {
    if (a === 'key') pressKey(s, p, String(v));
  },
  points(s, _p, i): PointDef[] {
    const w: [string, string] = ['接通', '斷開'];
    const o: [string, string] = ['吸合', '釋放'];
    return [
      { name: 'KEY 白(上)', on: !!i.KEY_W, words: w },
      { name: 'KEY 紅(停)', on: !!i.KEY_R, words: w },
      { name: 'KEY 黃(下)', on: !!i.KEY_Y, words: w },
      { name: '紅外線', on: !!i.IR, words: w },
      { name: 'SM', on: !!i.SM, words: w },
      { name: '輸出 上', on: s.out.UP, words: o },
      { name: '輸出 停', on: s.out.STOP, words: o },
      { name: '輸出 下', on: s.out.DOWN, words: o },
      { name: 'RELAY', on: s.out.RELAY, words: o },
    ];
  },
  drainLog(s) {
    const n = Math.min(s.beepSeq - s.logged, s.beeps.length);
    s.logged = s.beepSeq;
    return s.beeps.slice(s.beeps.length - n).map((b) => `${BEEP_TEXT[b.kind]}：${b.msg}`);
  },
};
