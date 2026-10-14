import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DT, MODELS, Simulator } from '../engine/sim';
import { EXAMPLES } from '../engine/examples';
import type { DeviceInstance, ProjectFile, Wire } from '../engine/types';
import type { BeepLog, HostState } from '../engine/host';
import { DeviceBody } from './DeviceBody';
import { Inspector } from './Inspector';
import { EventLog } from './EventLog';
import { playBeep } from './sound';
import { boxOf, GATE_IMG, HOST_IMG, layoutOf, portWorld, scaleOf, titleBelow } from './layout';
import { G, junctions, routeAll, type RouteReq } from './route';
import { wireColor } from './wires';

const STORAGE_KEY = 'control-sim-project-v3';
/** 自動播放時，狀態連續靜止這麼多秒（模擬時間）就算這次動作跑完 */
const SETTLE = 1;
const CATEGORIES = ['控制主機', '遙控', '電源', '輸入設備', '輸出設備', '繼電器類', '配線'] as const;

type Sel = { kind: 'device' | 'wire'; id: string } | null;
type Pt = { x: number; y: number };
type Drag =
  | { kind: 'move'; id: string; dx: number; dy: number; moved: boolean }
  /** 接線中：拖曳，或點一下端子後逐點點選轉折點（click） */
  | { kind: 'wire'; device: string; port: string; x: number; y: number; sx: number; sy: number; pts: Pt[]; click: boolean }
  /** 拖曳已選取接線的某一段來調整路徑 */
  | { kind: 'seg'; wire: string; i: number; horiz: boolean; full: Pt[] }
  /** 在空白處拖出框框，框選多個設備 */
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number }
  /** 拖曳選取設備右下角的小方塊調整圖示大小 */
  | { kind: 'scale'; id: string; s0: number; d0: number }
  | null;

const snap = (v: number) => Math.round(v / G) * G;
/** 新的轉折點和上一點對齊成水平或垂直 */
function orthoSnap(last: Pt, p: Pt): Pt {
  const q = { x: snap(p.x), y: snap(p.y) };
  return Math.abs(q.x - last.x) >= Math.abs(q.y - last.y) ? { x: q.x, y: last.y } : { x: last.x, y: q.y };
}

function loadInitial(sim: Simulator): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const f = JSON.parse(raw) as ProjectFile;
      sim.load(f);
      return f.name;
    }
  } catch {
    /* 讀不到就用範例 */
  }
  const f = EXAMPLES[0].make();
  sim.load(f);
  return f.name;
}

const pkey = (dev: string, port: string) => `${dev}.${port}`;

export function App() {
  const simRef = useRef<Simulator>();
  if (!simRef.current) simRef.current = new Simulator();
  const sim = simRef.current;
  const [name, setName] = useState(() => loadInitial(sim));
  const [tick, setTick] = useState(0);
  const [layoutRev, setLayoutRev] = useState(0);
  const [running, setRunning] = useState(false);
  /** 操作輸入設備時自動播放，動作完整跑完（狀態靜止 SETTLE 秒）後自動暫停 */
  const auto = useRef({ on: false, sig: '', quiet: 0 });
  // 右側面板與下方動作紀錄可收起來，讓畫布大一點（記在這個瀏覽器）
  const [showSide, setShowSide] = useState(() => readPref('control-sim-side', true));
  const [showLog, setShowLog] = useState(() => readPref('control-sim-log', true));
  useEffect(() => writePref('control-sim-side', showSide), [showSide]);
  useEffect(() => writePref('control-sim-log', showLog), [showLog]);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<Sel>(null);
  /** 框選的設備（兩個以上時一起移動、一起刪除） */
  const [multi, setMulti] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastBeeps = useRef(new Map<string, BeepLog | undefined>());

  const changed = useCallback(() => setTick((t) => t + 1), []);
  /** 手動播放／暫停：手動播放會一直跑，直到再按暫停 */
  const toggleRun = useCallback(() => {
    auto.current.on = false;
    setRunning((r) => !r);
  }, []);
  /** 輸入設備動作：暫停中就自動播放；已在自動播放就重新等這次動作跑完 */
  const kick = useCallback(() => {
    setRunning((r) => {
      if (!r) auto.current.on = true;
      return true;
    });
    auto.current.sig = '';
    auto.current.quiet = 0;
  }, []);
  /** 設備位置、接線、端子有變動時要重新佈線 */
  const relayout = useCallback(() => {
    setLayoutRev((r) => r + 1);
    setTick((t) => t + 1);
  }, []);

  // 模擬迴圈
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const el = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (running) {
        acc += el * speed;
        let n = 0;
        const a = auto.current;
        while (acc >= DT && n < 400) {
          sim.step();
          acc -= DT;
          n++;
          if (!a.on) continue;
          const sig = sim.signature();
          if (sig !== a.sig || sim.busy()) {
            a.sig = sig;
            a.quiet = 0;
          } else if ((a.quiet += DT) >= SETTLE) {
            a.on = false;
            acc = 0;
            setRunning(false);
            break;
          }
        }
        if (n > 0) setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, sim]);

  // 主機嗶聲
  useEffect(() => {
    for (const d of sim.devices) {
      if (d.type !== 'cvia92') continue;
      const beeps = (d.state as HostState).beeps;
      const prev = lastBeeps.current.get(d.id);
      const idx = prev ? beeps.indexOf(prev) : -1;
      const fresh = beeps.slice(idx + 1);
      if (fresh.length && d.params.o11.beep) playBeep(fresh[fresh.length - 1].kind);
      lastBeeps.current.set(d.id, beeps[beeps.length - 1]);
    }
  });

  // 自動儲存
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sim.toFile(name)));
      } catch {
        /* 無法儲存時略過 */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [sim, name]);

  const selDevice = sel?.kind === 'device' ? sim.devices.find((d) => d.id === sel.id) ?? null : null;
  const selWire = sel?.kind === 'wire' ? sim.wires.find((w) => w.id === sel.id) ?? null : null;

  const deleteSelected = useCallback(() => {
    if (multi.length > 1) {
      if (!confirm(`刪除選取的 ${multi.length} 個設備？`)) return;
      for (const id of multi) sim.removeDevice(id);
      sim.solve();
      setMulti([]);
      setSel(null);
      relayout();
      return;
    }
    if (!sel) return;
    if (sel.kind === 'device') sim.removeDevice(sel.id);
    else sim.removeWire(sel.id);
    sim.solve();
    setSel(null);
    relayout();
  }, [sel, multi, sim, relayout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (drag?.kind === 'wire' && drag.click) {
        // 畫線中：Esc 取消，Backspace 退回上一個轉折點
        if (e.key === 'Escape') setDrag(null);
        if (e.key === 'Backspace' || e.key === 'Delete') setDrag({ ...drag, pts: drag.pts.slice(0, -1) });
        return;
      }
      if (e.key === 'Escape') {
        setDrag(null);
        setMulti([]);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === ' ') {
        e.preventDefault();
        toggleRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, drag]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };

  const addDevice = (type: string) => {
    // 在目前可見範圍內找一個不和其他設備重疊的位置
    const wrap = wrapRef.current;
    const probe: DeviceInstance = { id: '', type, name: '', x: 0, y: 0, scale: 1, params: MODELS[type].defaultParams(), state: {} };
    const lay = layoutOf(probe);
    const ox = (wrap?.scrollLeft ?? 0) / zoom;
    const oy = (wrap?.scrollTop ?? 0) / zoom;
    const boxes = sim.devices.map((o) => boxOf(o));
    const free = (x: number, y: number) =>
      boxes.every((b) => x + lay.w + 40 < b.x1 || x - 40 > b.x2 || y + lay.h + 60 < b.y1 || y - 60 > b.y2);
    let pos = { x: ox + 40, y: oy + 40 };
    const maxW = Math.max(600, (wrap?.clientWidth ?? 900) / zoom - lay.w - 20);
    search: for (let y = oy + 40; y < oy + 1600; y += 40)
      for (let x = ox + 40; x < ox + maxW; x += 40)
        if (free(x, y)) {
          pos = { x, y };
          break search;
        }
    const d = sim.addDevice(type, pos.x, pos.y);
    if (type === 'remote') d.name = d.params.label = `遙控器 ${sim.devices.filter((x) => x.type === 'remote').length}`;
    sim.solve();
    setSel({ kind: 'device', id: d.id });
    relayout();
  };

  const loadFile = (f: ProjectFile) => {
    auto.current.on = false;
    setRunning(false);
    const old = sim.load(f);
    setName(f.name);
    setSel(null);
    lastBeeps.current.clear();
    relayout();
    if (old) alert('這是舊版的專案檔。新版改成實際接線（共點、NO/NC、電源），舊的接線無法對應，已保留設備、移除接線，請重新接線。');
  };

  const save = () => {
    const blob = new Blob([JSON.stringify(sim.toFile(name), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name || '專案'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sendKeys = (id: string, keys: string) => {
    for (const ch of keys) sim.action(id, 'key', ch);
    kick();
    changed();
  };

  // 畫布大小
  let maxX = 1400;
  let maxY = 900;
  const layouts = new Map(sim.devices.map((d) => [d.id, layoutOf(d)]));
  for (const d of sim.devices) {
    const b = boxOf(d, layouts.get(d.id));
    maxX = Math.max(maxX, b.x2 + 300);
    maxY = Math.max(maxY, b.y2 + 200);
  }
  maxX = Math.ceil(maxX / 100) * 100;
  maxY = Math.ceil(maxY / 100) * 100;

  // 直角佈線（只在設備位置或接線改變時重算）
  const routing = useMemo(() => {
    // 佈線用的節點：只看接線，不看接點狀態，避免模擬中線路跳動
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x);
      if (!p || p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    for (const w of sim.wires) {
      const a = find(pkey(w.from.device, w.from.port));
      const b = find(pkey(w.to.device, w.to.port));
      if (a !== b) parent.set(a, b);
    }
    const byId = new Map(sim.devices.map((d) => [d.id, d]));
    const reqs: RouteReq[] = [];
    for (const w of sim.wires) {
      const f = byId.get(w.from.device);
      const t = byId.get(w.to.device);
      if (!f || !t) continue;
      const end = (d: DeviceInstance, port: string) => ({ ...portWorld(d, port), box: boxOf(d) });
      reqs.push({ id: w.id, net: find(pkey(w.from.device, w.from.port)), a: end(f, w.from.port), b: end(t, w.to.port), manual: w.points });
    }
    const obstacles = sim.devices.filter((d) => d.type !== 'node').map((d) => boxOf(d));
    const routes = routeAll(reqs, obstacles, maxX, maxY);
    return { routes: new Map(routes.map((r) => [r.id, r])), dots: junctions(routes, maxX) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutRev, maxX, maxY, sim]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    if (drag.kind === 'move') {
      const d = sim.devices.find((x) => x.id === drag.id);
      if (d) {
        // 框選的設備一起移動；接線兩端都在裡面的手動走線也跟著平移
        const group = multi.includes(d.id) ? sim.devices.filter((o) => multi.includes(o.id)) : [d];
        let ddx = Math.round((p.x - drag.dx) / G) * G - d.x;
        let ddy = Math.round((p.y - drag.dy) / G) * G - d.y;
        for (const o of group) {
          ddx = Math.max(ddx, -o.x);
          ddy = Math.max(ddy, 20 - o.y);
        }
        if (ddx || ddy) {
          for (const o of group) {
            o.x += ddx;
            o.y += ddy;
          }
          if (group.length > 1) {
            const ids = new Set(group.map((o) => o.id));
            for (const w of sim.wires)
              if (w.points && ids.has(w.from.device) && ids.has(w.to.device)) w.points = w.points.map((q) => ({ x: q.x + ddx, y: q.y + ddy }));
          }
          if (!drag.moved) setDrag({ ...drag, moved: true });
          relayout();
        }
      }
    } else if (drag.kind === 'box') {
      setDrag({ ...drag, x1: p.x, y1: p.y });
    } else if (drag.kind === 'scale') {
      const d = sim.devices.find((x) => x.id === drag.id);
      if (d) {
        const dist = Math.max(1, p.x - d.x + (p.y - d.y));
        const ns = Math.round(Math.max(0.3, Math.min(3, (drag.s0 * dist) / drag.d0)) * 20) / 20;
        if (ns !== d.scale) {
          d.scale = ns;
          relayout();
        }
      }
    } else if (drag.kind === 'seg') {
      const w = sim.wires.find((x) => x.id === drag.wire);
      if (!w) return;
      const full = drag.full.map((q) => ({ ...q }));
      if (drag.horiz) full[drag.i].y = full[drag.i + 1].y = snap(p.y);
      else full[drag.i].x = full[drag.i + 1].x = snap(p.x);
      w.points = full.slice(1, -1);
      relayout();
    } else {
      setDrag({ ...drag, x: p.x, y: p.y });
    }
  };

  /** 拖曳線段：把目前路徑轉成手動轉折點；拖頭尾段時先補一個點，端子引出線不動 */
  const startSeg = (e: React.PointerEvent, w: Wire, idx: number) => {
    e.stopPropagation();
    const r = routing.routes.get(w.id);
    if (!r) return;
    const full = r.points.map((q) => ({ ...q }));
    let i = idx;
    if (i === full.length - 2) full.splice(full.length - 1, 0, { ...full[full.length - 1] });
    if (i === 0) {
      full.splice(1, 0, { ...full[0] });
      i = 1;
    }
    const horiz = Math.abs(r.points[idx].y - r.points[idx + 1].y) < 0.01;
    setSel({ kind: 'wire', id: w.id });
    setDrag({ kind: 'seg', wire: w.id, i, horiz, full });
  };

  const startWire = (e: React.PointerEvent, device: string, port: string) => {
    const pt = toSvg(e);
    setDrag({ kind: 'wire', device, port, x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, pts: [], click: false });
  };

  /** 畫線中在空白處點一下：加一個轉折點 */
  const addBend = (e: React.PointerEvent) => {
    if (drag?.kind !== 'wire' || !drag.click) return false;
    const d = sim.devices.find((x) => x.id === drag.device);
    if (!d) return false;
    const last = drag.pts[drag.pts.length - 1] ?? portWorld(d, drag.port);
    setDrag({ ...drag, pts: [...drag.pts, orthoSnap(last, toSvg(e))] });
    return true;
  };

  const finishWire = (device: string, port: string) => {
    if (drag?.kind !== 'wire') return;
    if (device === drag.device && port === drag.port) {
      // 在同一個端子按下又放開：進入逐點畫線
      if (!drag.click && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) < 4) setDrag({ ...drag, click: true });
      return;
    }
    const w = sim.connect(drag.device, drag.port, device, port);
    if (w && drag.pts.length) w.points = drag.pts;
    setDrag(null);
    if (w) setSel({ kind: 'wire', id: w.id });
    sim.solve();
    relayout();
  };

  /** 把接線拖到另一條線上：在落點加一個節點，原線拆成兩段並接上新線 */
  const dropOnWire = (w: Wire, e: React.PointerEvent) => {
    if (drag?.kind !== 'wire') return;
    const p = toSvg(e);
    const route = routing.routes.get(w.id);
    let best = { x: Math.round(p.x / G) * G, y: Math.round(p.y / G) * G, dist: Infinity };
    // 吸附到線上最近的點
    if (route) {
      const pts = route.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const cx = Math.min(Math.max(p.x, Math.min(a.x, b.x)), Math.max(a.x, b.x));
        const cy = Math.min(Math.max(p.y, Math.min(a.y, b.y)), Math.max(a.y, b.y));
        const dist = Math.hypot(cx - p.x, cy - p.y);
        if (dist < best.dist) best = { x: cx, y: cy, dist };
      }
    }
    const n = sim.addDevice('node', Math.round(best.x / G) * G, Math.round(best.y / G) * G);
    sim.removeWire(w.id);
    const w1 = sim.connect(w.from.device, w.from.port, n.id, 'P', w.color);
    const w2 = sim.connect(n.id, 'P', w.to.device, w.to.port, w.color);
    // 手動走線拆成兩段時，各自保留落點前後的轉折點
    if (w.points && route && w1 && w2) {
      const pts = route.points;
      let k = 0;
      let bd = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const cx = Math.min(Math.max(best.x, Math.min(a.x, b.x)), Math.max(a.x, b.x));
        const cy = Math.min(Math.max(best.y, Math.min(a.y, b.y)), Math.max(a.y, b.y));
        const dd = Math.hypot(cx - best.x, cy - best.y);
        if (dd < bd) {
          bd = dd;
          k = i;
        }
      }
      w1.points = pts.slice(1, k);
      w2.points = pts.slice(k, -1);
    }
    const nw = sim.connect(drag.device, drag.port, n.id, 'P');
    if (nw && drag.pts.length) nw.points = drag.pts;
    sim.solve();
    setDrag(null);
    setSel({ kind: 'device', id: n.id });
    relayout();
  };

  const sol = sim.solution;
  const netLive = (devId: string, port: string) => {
    const n = sol.net.get(pkey(devId, port));
    return !!n && (sol.hot.has(n) || sol.active.has(n));
  };

  const startScale = (e: React.PointerEvent, d: DeviceInstance) => {
    e.stopPropagation();
    const p = toSvg(e);
    setDrag({ kind: 'scale', id: d.id, s0: scaleOf(d), d0: Math.max(1, p.x - d.x + (p.y - d.y)) });
  };

  const startMove = (e: React.PointerEvent, d: DeviceInstance) => {
    e.stopPropagation();
    if (drag?.kind === 'wire' && drag.click) return;
    setSel({ kind: 'device', id: d.id });
    if (!multi.includes(d.id)) setMulti([]);
    const p = toSvg(e);
    setDrag({ kind: 'move', id: d.id, dx: p.x - d.x, dy: p.y - d.y, moved: false });
  };

  return (
    <div className={`app${showSide ? '' : ' no-side'}`}>
      <div className="toolbar">
        <h1>控制系統模擬器</h1>
        <button className="primary" onClick={toggleRun} title="空白鍵（操作設備時會自動播放，動作跑完自動暫停）">
          {running ? '⏸ 暫停' : '▶ 播放'}
        </button>
        <button
          onClick={() => {
            sim.step();
            changed();
          }}
          disabled={running}
        >
          單步
        </button>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="模擬速度">
          {[0.25, 0.5, 1, 2, 5, 10].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            sim.reset();
            lastBeeps.current.clear();
            changed();
          }}
        >
          重置
        </button>
        <span className="time">{sim.t.toFixed(2)} 秒</span>
        <label className="zoom" title="整個畫布的顯示大小">
          顯示
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[0.5, 0.67, 0.8, 1, 1.25, 1.5, 2].map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </label>
        <button className={showSide ? 'toggle on' : 'toggle'} onClick={() => setShowSide((v) => !v)} title="顯示或收起右側的使用方式／設定面板">
          右側面板
        </button>
        <button className={showLog ? 'toggle on' : 'toggle'} onClick={() => setShowLog((v) => !v)} title="顯示或收起下方的接點動作紀錄">
          動作紀錄
        </button>
        <span className="spacer" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 170 }} title="專案名稱" />
        <select
          value=""
          onChange={(e) => {
            const ex = EXAMPLES[Number(e.target.value)];
            if (ex && confirm(`載入範例「${ex.name}」？目前畫布會被取代。`)) loadFile(ex.make());
          }}
        >
          <option value="">載入範例…</option>
          {EXAMPLES.map((ex, i) => (
            <option key={i} value={i}>
              {ex.name}
            </option>
          ))}
        </select>
        <button onClick={() => confirm('建立空白專案？目前畫布會被清空。') && loadFile({ version: 2, name: '新專案', devices: [], wires: [] })}>
          新專案
        </button>
        <button onClick={save}>儲存</button>
        <button onClick={() => fileRef.current?.click()}>開啟</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              loadFile(JSON.parse(await f.text()));
            } catch {
              alert('無法讀取這個檔案');
            }
          }}
        />
      </div>

      <div className="palette">
        {CATEGORIES.map((c) => (
          <div key={c} style={{ display: 'contents' }}>
            <h3>{c}</h3>
            {Object.values(MODELS)
              .filter((m) => m.category === c)
              .map((m) => (
                <button key={m.type} onClick={() => addDevice(m.type)}>
                  ＋ {m.name}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="canvas-wrap" ref={wrapRef}>
        {drag?.kind === 'wire' && drag.click && (
          <div className="draw-hint">
            畫線中：在空白處點一下加轉折點，點目標端子或另一條線完成。Backspace 退一點，Esc 取消。
            <button onClick={() => setDrag(null)}>取消</button>
          </div>
        )}
        <svg
          ref={svgRef}
          width={maxX * zoom}
          height={maxY * zoom}
          viewBox={`0 0 ${maxX} ${maxY}`}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            if ((drag?.kind === 'move' && drag.moved) || drag?.kind === 'scale') relayout();
            if (drag?.kind === 'box') {
              const x1 = Math.min(drag.x0, drag.x1);
              const x2 = Math.max(drag.x0, drag.x1);
              const y1 = Math.min(drag.y0, drag.y1);
              const y2 = Math.max(drag.y0, drag.y1);
              // 設備與框框有重疊就算選到
              const hit = sim.devices.filter((d) => {
                const b = boxOf(d, layouts.get(d.id));
                return b.x1 < x2 && b.x2 > x1 && b.y1 < y2 && b.y2 > y1;
              });
              setMulti(x2 - x1 > 4 || y2 - y1 > 4 ? hit.map((d) => d.id) : []);
              setSel(hit.length === 1 && (x2 - x1 > 4 || y2 - y1 > 4) ? { kind: 'device', id: hit[0].id } : null);
            }
            if (drag?.kind === 'wire' && drag.click) return;
            setDrag(null);
          }}
          onPointerLeave={() => {
            if (!(drag?.kind === 'wire' && drag.click)) setDrag(null);
          }}
          onPointerDown={(e) => {
            if (e.target === svgRef.current || (e.target as Element).id === 'grid-bg') {
              if (!addBend(e)) {
                setSel(null);
                setMulti([]);
                const p = toSvg(e);
                setDrag({ kind: 'box', x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }
            }
          }}
        >
          <defs>
            <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
              <path d="M20 0 L0 0 0 20" fill="none" stroke="var(--grid)" strokeWidth={1} />
            </pattern>
          </defs>
          <rect id="grid-bg" width={maxX} height={maxY} fill="url(#grid)" />

          {sim.wires.map((w) => {
            const r = routing.routes.get(w.id);
            if (!r) return null;
            const path = 'M' + r.points.map((p) => `${p.x},${p.y}`).join(' L');
            const live = netLive(w.from.device, w.from.port);
            const selected = sel?.kind === 'wire' && sel.id === w.id;
            return (
              <g key={w.id}>
                {live && <path d={path} className="wire-live" />}
                {selected && <path d={path} className="wire-sel" />}
                <path d={path} className="wire" style={{ stroke: wireColor(sim, w) }} />
                <path
                  d={path}
                  className="wire-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (drag?.kind === 'wire' && drag.click) return;
                    setSel({ kind: 'wire', id: w.id });
                  }}
                  onPointerUp={(e) => {
                    if (drag?.kind === 'wire') {
                      e.stopPropagation();
                      dropOnWire(w, e);
                    }
                  }}
                />
              </g>
            );
          })}
          {routing.dots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} className="junction" />
          ))}

          {sim.devices.map((d) => {
            const lay = layouts.get(d.id)!;
            const sc = scaleOf(d);
            const selected = (sel?.kind === 'device' && sel.id === d.id) || multi.includes(d.id);
            if (d.type === 'node') {
              const live = netLive(d.id, 'P');
              return (
                <g key={d.id} transform={`translate(${d.x},${d.y})`} className="node" onPointerDown={(e) => startMove(e, d)}>
                  <circle r={10} className="node-hit" />
                  <circle
                    r={selected ? 6 : 5}
                    className={`junction${live ? ' live' : ''}${selected ? ' selected' : ''}`}
                    onPointerUp={(e) => {
                      if (drag?.kind === 'wire') {
                        e.stopPropagation();
                        finishWire(d.id, 'P');
                      }
                    }}
                  />
                  <title>節點（拖曳移動；把接線拖到這裡相接）</title>
                </g>
              );
            }
            const ports = sim.ports(d);
            const socket = d.type === 'relay' || d.type === 'timer';
            // 主機與柵欄機用圖片，端子標籤已印在圖上
            const imgDev = d.type === 'cvia92' || d.type === 'gate';
            return (
              <g key={d.id} transform={`translate(${d.x},${d.y}) scale(${sc})`} className={selected ? 'dev-selected' : ''} onPointerDown={(e) => startMove(e, d)} style={{ cursor: 'move' }}>
                {selected && <rect x={-6} y={-6} width={lay.w + 12} height={lay.h + 12} rx={8} className="sel-outline" />}
                <DeviceBody
                  d={d}
                  w={lay.w}
                  h={lay.h}
                  mismatch={!!sol.mismatch[d.id]}
                  short={sol.shorts.has(d.id)}
                  act={(a, v) => {
                    sim.action(d.id, a, v);
                    kick();
                    changed();
                  }}
                />
                <text className="dev-title" x={d.type === 'cvia92' ? lay.w / 2 : 0} y={titleBelow(d) ? lay.h + 15 : -6} textAnchor={d.type === 'cvia92' ? 'middle' : 'start'}>
                  {d.name}
                </text>
                {ports.map((p) => {
                  const pp = lay.ports[p.id];
                  if (!pp) return null;
                  const on = netLive(d.id, p.id);
                  const labelY = pp.side === 'top' ? pp.y + 16 : pp.y - 9;
                  return (
                    <g
                      key={p.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (drag?.kind === 'wire' && drag.click) return;
                        startWire(e, d.id, p.id);
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        finishWire(d.id, p.id);
                      }}
                      style={{ cursor: 'crosshair' }}
                    >
                      {imgDev ? (
                        // 用圖上原本的端子圓點；只放透明的點擊範圍，帶電時才疊上橘色
                        <circle className={`img-port${on ? ' on' : ''}`} cx={pp.x} cy={pp.y} r={d.type === 'cvia92' ? HOST_IMG.portR : GATE_IMG.portR} />
                      ) : socket ? (
                        <>
                          <circle className={`pin${on ? ' on' : ''}`} cx={pp.x} cy={pp.y} r={10} />
                          <text className="pin-text" x={pp.x} y={pp.y + 4} textAnchor="middle">
                            {pp.tag}
                          </text>
                        </>
                      ) : (
                        <>
                          <text className="port-label" x={pp.x} y={labelY} textAnchor="middle">
                            {pp.tag}
                          </text>
                          <circle className={`port${on ? ' on' : ''}`} cx={pp.x} cy={pp.y} r={6} />
                        </>
                      )}
                      <title>{`${d.name}・${p.label}（拖曳到其他端子接線）`}</title>
                    </g>
                  );
                })}
                {selected && multi.length < 2 && (
                  <rect
                    className="scale-handle"
                    x={lay.w - 5 / sc}
                    y={lay.h - 5 / sc}
                    width={10 / sc}
                    height={10 / sc}
                    onPointerDown={(e) => startScale(e, d)}
                  >
                    <title>拖曳調整圖示大小</title>
                  </rect>
                )}
              </g>
            );
          })}

          {drag?.kind === 'wire' &&
            (() => {
              const d = sim.devices.find((x) => x.id === drag.device);
              if (!d) return null;
              const a = portWorld(d, drag.port);
              if (!drag.click && drag.pts.length === 0)
                return <path className="wire-drag" d={`M${a.x},${a.y} L${drag.x},${a.y} L${drag.x},${drag.y}`} />;
              const last = drag.pts[drag.pts.length - 1] ?? a;
              const cur = orthoSnap(last, drag);
              const pts = [a, ...drag.pts, cur];
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <path className="wire-drag" d={'M' + pts.map((q) => `${q.x},${q.y}`).join(' L')} />
                  {drag.pts.map((q, i) => (
                    <circle key={i} cx={q.x} cy={q.y} r={3.5} className="bend" />
                  ))}
                </g>
              );
            })()}
          {drag?.kind === 'box' && (
            <rect
              className="box-sel"
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
            />
          )}
          {sel?.kind === 'wire' &&
            !(drag?.kind === 'wire') &&
            (() => {
              const w = sim.wires.find((x) => x.id === sel.id);
              const r = w && routing.routes.get(w.id);
              if (!w || !r) return null;
              return r.points.slice(1).map((b, i) => {
                const a = r.points[i];
                const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                if (len < 16) return null;
                const horiz = Math.abs(a.y - b.y) < 0.01;
                return (
                  <rect
                    key={i}
                    x={(a.x + b.x) / 2 - 5}
                    y={(a.y + b.y) / 2 - 5}
                    width={10}
                    height={10}
                    className="seg-handle"
                    style={{ cursor: horiz ? 'ns-resize' : 'ew-resize' }}
                    onPointerDown={(e) => startSeg(e, w, i)}
                  >
                    <title>拖曳移動這一段</title>
                  </rect>
                );
              });
            })()}
        </svg>
      </div>

      {showSide && <Inspector sim={sim} device={selDevice} wire={selWire} changed={changed} relayout={relayout} sendKeys={sendKeys} />}

      {showLog && (
        <div className="chart">
          <EventLog sim={sim} selected={selDevice?.id ?? null} tick={tick} changed={changed} />
        </div>
      )}
    </div>
  );
}

function readPref(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}

function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    // 無法記住時忽略
  }
}
