import type { DeviceInstance, DeviceModel, LogEntry, PortDef, ProjectFile, Rating, RfEvent, Wire } from './types';
import * as basic from './devices';
import { cvia92 } from './host';

export const MODELS: Record<string, DeviceModel> = {
  cvia92,
  remote: basic.remote,
  power: basic.power,
  pushButton: basic.pushButton,
  toggleSwitch: basic.toggleSwitch,
  loopDetector: basic.loopDetector,
  irSensor: basic.irSensor,
  cardReader: basic.cardReader,
  gate: basic.gate,
  lamp: basic.lamp,
  trafficLight: basic.trafficLight,
  buzzer: basic.buzzer,
  relay: basic.relay,
  timer: basic.timer,
  node: basic.node,
};

export const DT = 0.05; // 掃描週期 50 ms

let idSeq = 1;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

const key = (dev: string, port: string) => `${dev}.${port}`;

/** 電路求解結果 */
export interface Solution {
  /** 端子 → 節點代表 */
  net: Map<string, string>;
  /** 帶電的節點（接到開啟中電源的正極或 L） */
  hot: Set<string>;
  /** 乾接點輸入接通時所在的節點 */
  active: Set<string>;
  /** 各設備的負載通電／乾接點接通狀態 */
  inputs: Record<string, Record<string, boolean>>;
  /** 有電但額定電壓不符的負載：設備 id → 負載 id 列表 */
  mismatch: Record<string, string[]>;
  /** 正負極被直接接通的電源 */
  shorts: Set<string>;
}

function ratingOk(load: Rating | null | undefined, src: Rating) {
  if (!load) return true;
  return load.kind === src.kind && Math.abs(src.volts - load.volts) <= load.volts * 0.15 + 1e-9;
}

export class Simulator {
  t = 0;
  devices: DeviceInstance[] = [];
  wires: Wire[] = [];
  solution: Solution = emptySolution();
  log: LogEntry[] = [];
  logMax = 1000;
  private rfQueue: RfEvent[] = [];
  private lastPoints = new Map<string, boolean>();

  model(d: DeviceInstance) {
    return MODELS[d.type];
  }

  ports(d: DeviceInstance): PortDef[] {
    return this.model(d).ports(d.params);
  }

  addDevice(type: string, x: number, y: number, name?: string, params?: any): DeviceInstance {
    const m = MODELS[type];
    const p = params ?? m.defaultParams();
    const n = name ?? (type === 'node' ? '節點' : `${m.name}${this.devices.filter((d) => d.type === type).length + 1}`);
    const d: DeviceInstance = { id: newId('d'), type, name: n, x, y, scale: 1, params: p, state: m.init(p) };
    this.devices.push(d);
    return d;
  }

  removeDevice(id: string) {
    this.devices = this.devices.filter((d) => d.id !== id);
    this.wires = this.wires.filter((w) => w.from.device !== id && w.to.device !== id);
  }

  /** 接線不分方向；同兩端子重複接線會略過 */
  connect(dev1: string, port1: string, dev2: string, port2: string, color?: string): Wire | null {
    if (dev1 === dev2 && port1 === port2) return null;
    const same = (a: { device: string; port: string }, d: string, p: string) => a.device === d && a.port === p;
    if (this.wires.some((w) => (same(w.from, dev1, port1) && same(w.to, dev2, port2)) || (same(w.from, dev2, port2) && same(w.to, dev1, port1))))
      return null;
    const w: Wire = { id: newId('w'), from: { device: dev1, port: port1 }, to: { device: dev2, port: port2 } };
    if (color) w.color = color;
    this.wires.push(w);
    return w;
  }

  removeWire(id: string) {
    this.wires = this.wires.filter((w) => w.id !== id);
  }

  /** 移除端子已不存在的接線（例如繼電器組數變少） */
  pruneWires() {
    const has = (dev: string, port: string) => {
      const d = this.devices.find((x) => x.id === dev);
      return !!d && this.ports(d).some((p) => p.id === port);
    };
    this.wires = this.wires.filter((w) => has(w.from.device, w.from.port) && has(w.to.device, w.to.port));
  }

  action(id: string, action: string, value?: unknown) {
    const d = this.devices.find((x) => x.id === id);
    if (!d) return;
    const ev = this.model(d).action?.(d.state, d.params, action, value);
    if (ev) this.rfQueue.push(...ev);
    this.solve();
  }

  /** 依目前各設備的接點狀態求出每個節點，再判斷負載通電與乾接點接通 */
  solve(): Solution {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = parent.get(x) ?? x;
      if (r === x) return x;
      r = find(r);
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const d of this.devices) {
      for (const p of this.ports(d)) parent.set(key(d.id, p.id), key(d.id, p.id));
    }
    for (const w of this.wires) union(key(w.from.device, w.from.port), key(w.to.device, w.to.port));
    for (const d of this.devices) {
      for (const [a, b] of this.model(d).contacts?.(d.state, d.params) ?? []) union(key(d.id, a), key(d.id, b));
    }

    const net = new Map<string, string>();
    for (const k of parent.keys()) net.set(k, find(k));

    const sources: { dev: string; hot: string; cold: string; rating: Rating }[] = [];
    const shorts = new Set<string>();
    const hot = new Set<string>();
    for (const d of this.devices) {
      for (const s of this.model(d).sources?.(d.state, d.params) ?? []) {
        if (!s.on) continue;
        const h = find(key(d.id, s.hot));
        const c = find(key(d.id, s.cold));
        if (h === c) {
          shorts.add(d.id);
          continue;
        }
        sources.push({ dev: d.id, hot: h, cold: c, rating: s.rating });
        hot.add(h);
      }
    }

    const inputs: Solution['inputs'] = {};
    const mismatch: Solution['mismatch'] = {};
    const active = new Set<string>();
    for (const d of this.devices) {
      const m = this.model(d);
      const res: Record<string, boolean> = {};
      for (const l of m.loads?.(d.params) ?? []) {
        const a = find(key(d.id, l.a));
        const b = find(key(d.id, l.b));
        const src = sources.find((s) => (s.hot === a && s.cold === b) || (s.hot === b && s.cold === a));
        if (!src) continue;
        if (ratingOk(l.rating, src.rating)) res[l.id] = true;
        else (mismatch[d.id] ??= []).push(l.id);
      }
      for (const s of m.senses?.(d.params) ?? []) {
        const a = find(key(d.id, s.a));
        if (a === find(key(d.id, s.b))) {
          res[s.id] = true;
          active.add(a);
        }
      }
      inputs[d.id] = res;
    }
    this.solution = { net, hot, active, inputs, mismatch, shorts };
    return this.solution;
  }

  step() {
    this.t = Math.round((this.t + DT) * 1000) / 1000;
    const rf = this.rfQueue;
    this.rfQueue = [];
    const sol = this.solve();
    for (const d of this.devices) {
      this.model(d).step?.(d.state, d.params, { t: this.t, dt: DT, inputs: sol.inputs[d.id] ?? {}, rf });
    }
    this.solve();
    this.record();
  }

  run(seconds: number) {
    const n = Math.round(seconds / DT);
    for (let k = 0; k < n; k++) this.step();
  }

  private push(e: LogEntry) {
    this.log.push(e);
    if (this.log.length > this.logMax) this.log.shift();
  }

  /** 接點動作紀錄：記下每個點位的變化與主機嗶聲 */
  private record() {
    const sol = this.solution;
    for (const d of this.devices) {
      const m = this.model(d);
      for (const msg of m.drainLog?.(d.state) ?? []) this.push({ t: this.t, device: d.id, deviceName: d.name, point: '嗶聲', text: msg });
      for (const pt of m.points?.(d.state, d.params, sol.inputs[d.id] ?? {}) ?? []) {
        const k = `${d.id}|${pt.name}`;
        const prev = this.lastPoints.get(k);
        this.lastPoints.set(k, pt.on);
        if (prev === undefined ? !pt.on : prev === pt.on) continue;
        const [w1, w0] = pt.words ?? ['動作', '復歸'];
        this.push({ t: this.t, device: d.id, deviceName: d.name, point: pt.name, text: pt.on ? w1 : w0, on: pt.on });
      }
      if (sol.mismatch[d.id]) {
        const k = `${d.id}|電壓不符`;
        if (!this.lastPoints.get(k)) this.push({ t: this.t, device: d.id, deviceName: d.name, point: '電源', text: '電壓不符，不動作', on: false });
        this.lastPoints.set(k, true);
      } else this.lastPoints.delete(`${d.id}|電壓不符`);
      if (sol.shorts.has(d.id)) {
        const k = `${d.id}|短路`;
        if (!this.lastPoints.get(k)) this.push({ t: this.t, device: d.id, deviceName: d.name, point: '電源', text: '正負極短路！', on: false });
        this.lastPoints.set(k, true);
      } else this.lastPoints.delete(`${d.id}|短路`);
    }
  }

  clearLog() {
    this.log = [];
  }

  reset() {
    this.t = 0;
    this.rfQueue = [];
    this.log = [];
    this.lastPoints.clear();
    for (const d of this.devices) d.state = this.model(d).init(d.params);
    this.solve();
  }

  toFile(name: string): ProjectFile {
    return {
      version: 2,
      name,
      devices: this.devices.map(({ state: _s, ...rest }) => JSON.parse(JSON.stringify(rest))),
      wires: JSON.parse(JSON.stringify(this.wires)),
    };
  }

  /** 讀取專案。回傳 true 表示是舊版（單向訊號）存檔，接線格式不同已略過 */
  load(f: ProjectFile | { version: number; name: string; devices: any[]; wires: any[] }): boolean {
    const old = f.version !== 2;
    this.devices = f.devices
      .filter((d) => MODELS[d.type])
      .map((d) => {
        const m = MODELS[d.type];
        const params = mergeDefaults(m.defaultParams(), d.params);
        return { ...d, scale: d.scale ?? 1, params, state: m.init(params) };
      });
    this.wires = old ? [] : (f.wires as Wire[]);
    this.pruneWires();
    this.reset();
    return old;
  }
}

function emptySolution(): Solution {
  return { net: new Map(), hot: new Set(), active: new Set(), inputs: {}, mismatch: {}, shorts: new Set() };
}

/** 舊存檔缺少的新參數補上預設值 */
function mergeDefaults(def: any, saved: any): any {
  if (saved === undefined) return def;
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return saved;
  const out: any = { ...def };
  for (const k of Object.keys(saved)) out[k] = mergeDefaults(def[k], saved[k]);
  return out;
}
